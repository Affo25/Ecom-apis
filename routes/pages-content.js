const express = require('express');
const router = express.Router();
const PageContent = require('../models/page-content');
const multer = require('multer');
const mongoose = require('mongoose');

const R2ImageService = require('../services/R2ImageService');
const { singleImageUpload } = require('../middleware/r2Upload');

// Import generic database service
const {
  findAll,
  findOne,
  findById,
  insertOne,
  updateOne,
  updateById,
  deleteOne,
  deleteById,
  countDocuments,
  exists,
  distinct,
  updateMany
} = require('../services/mongoose_service');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 1 // Maximum 1 file (featured image only)
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Debug endpoint to test database connection and pages
router.get('/debug', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const pageCount = await countDocuments(PageContent);
    const publishedPageCount = await countDocuments(PageContent, { status: 'published' });
    
    res.json({
      success: true,
      message: 'Debug info',
      data: {
        database: dbStatus,
        environment: process.env.NODE_ENV || 'development',
        totalPages: pageCount,
        publishedPages: publishedPageCount,
        imageUploadsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});

// Get all pages with filtering, sorting, and pagination
router.get('/', async (req, res) => {
  try {
    console.log('📄 Fetching pages - DB state:', mongoose.connection.readyState);
    
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'desc',
      status,
      search,
      pageName
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search && search.trim()) {
      filter.$or = [
        { pageName: { $regex: search.trim(), $options: 'i' } },
        { pageTitle: { $regex: search.trim(), $options: 'i' } },
        { pageDescription: { $regex: search.trim(), $options: 'i' } },
        { slug: { $regex: search.trim(), $options: 'i' } }
      ];
    }
    
    if (pageName && pageName.trim()) {
      filter.pageName = { $regex: pageName.trim(), $options: 'i' };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query using generic service
    const pages = await findAll(PageContent, filter, {
      sort: sortObj,
      skip: skip,
      limit: parseInt(limit),
      lean: true
    });

    // Get total count for pagination
    const total = await countDocuments(PageContent, filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Pages fetched successfully',
      data: {
        pages,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching pages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pages',
      error: error.message
    });
  }
});

// Get all pages (simplified for dropdowns)
router.get('/all', async (req, res) => {
  try {
    const { status = 'published' } = req.query;
    const filter = status !== 'all' ? { status } : {};
    
    const pages = await findAll(PageContent, filter, {
      select: '_id pageName slug pageTitle',
      sort: { pageName: 1 },
      lean: true
    });

    res.json({
      success: true,
      message: 'Pages fetched successfully',
      data: pages
    });
  } catch (error) {
    console.error('Error fetching all pages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pages',
      error: error.message
    });
  }
});

// Get page by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const page = await findOne(PageContent, { slug: req.params.slug });
    
    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    res.json({
      success: true,
      message: 'Page fetched successfully',
      data: page
    });
  } catch (error) {
    console.error('Error fetching page by slug:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch page',
      error: error.message
    });
  }
});

// Get single page by ID
router.get('/:id', async (req, res) => {
  try {
    const page = await findById(PageContent, req.params.id);
    
    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    res.json({
      success: true,
      message: 'Page fetched successfully',
      data: page
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch page',
      error: error.message
    });
  }
});

// Create new page with R2 image upload
router.post('/', singleImageUpload, async (req, res) => {
  try {
    console.log('🆕 Creating new page');
    console.log('📦 Request body:', req.body);
    console.log('📸 File:', req.file ? 'Yes' : 'No');

    const pageData = req.body;
    
    // Handle featured image upload to R2
    let featuredImageUrl = null;
    
    if (req.files && req.files.image) {
      try {
        console.log('📸 Processing featured image upload to R2...');
        console.log('📁 File details:', {
          fieldname: req.files.image[0].fieldname,
          originalname: req.files.image[0].originalname,
          encoding: req.files.image[0].encoding,
          mimetype: req.files.image[0].mimetype,
          size: req.files.image[0].size,
          hasBuffer: !!req.files.image[0].buffer
        });
        
        const r2Service = req.r2Service;
        const result = await r2Service.uploadSingleImage(req.files.image[0], 'pages');
        featuredImageUrl = result.url;
        
        console.log(`✅ Featured image uploaded to R2: ${featuredImageUrl}`);
      } catch (uploadError) {
        console.error('❌ Error uploading featured image to R2:', uploadError);
        // Don't throw error, just continue without featured image
      }
    } else {
      console.log('📸 No featured image file provided');
    }

    // Generate slug from pageName
    const slug = pageData.pageName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Ensure slug is unique
    const existingSlug = await findOne(PageContent, { slug });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    // Parse pageContent JSON if it's a string
    let pageContentObject = {};
    if (pageData.pageContent) {
      try {
        pageContentObject = typeof pageData.pageContent === 'string' 
          ? JSON.parse(pageData.pageContent) 
          : pageData.pageContent;
      } catch (parseError) {
        console.error('Error parsing pageContent JSON:', parseError);
        pageContentObject = { htmlContent: '' };
      }
    }

    // Prepare page data
    const newPageData = {
      pageName: pageData.pageName || 'Untitled Page',
      slug: finalSlug,
      pageTitle: pageData.pageTitle || pageData.pageName || 'Untitled Page',
      pageDescription: pageData.pageDescription || '',
      status: pageData.status || 'draft',
      pageContent: pageContentObject
    };

    // Only set featured image if one was uploaded
    if (featuredImageUrl) {
      newPageData.featuredImage = featuredImageUrl;
    }

    console.log('💾 Final page data:', newPageData);

    // Create page using generic service
    const page = await insertOne(PageContent, newPageData);

    console.log('✅ Page created successfully');

    res.status(201).json({
      success: true,
      message: 'Page created successfully',
      data: page
    });
  } catch (error) {
    console.error('❌ Error creating page:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Page with this ${duplicateField} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create page',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update page with R2 image upload
router.put('/:id', singleImageUpload, async (req, res) => {
  try {
    console.log('🔄 Updating page with ID:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📸 File:', req.file ? 'Yes' : 'No');

    const pageData = req.body;
    const existingPage = await findById(PageContent, req.params.id);
    
    if (!existingPage) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    // Handle featured image operations with R2
    let featuredImageUrl = existingPage.featuredImage;
    
    if (req.files && req.files.image) {
      try {
        console.log('📸 Processing featured image UPDATE to R2...');
        console.log('📁 New file details:', {
          originalname: req.files.image[0].originalname,
          mimetype: req.files.image[0].mimetype,
          size: req.files.image[0].size,
          hasBuffer: !!req.files.image[0].buffer
        });
        
        const r2Service = req.r2Service;
        const result = await r2Service.uploadSingleImage(req.files.image[0], 'pages');
        featuredImageUrl = result.url;
        
        console.log(`✅ New featured image uploaded to R2: ${featuredImageUrl}`);
        
        // Delete old featured image from R2 if exists
        if (existingPage.featuredImage) {
          try {
            console.log(`🗑️ Deleting old featured image from R2: ${existingPage.featuredImage}`);
            await r2Service.deleteImage(existingPage.featuredImage);
            console.log(`✅ Old R2 image deleted successfully`);
          } catch (deleteError) {
            console.error('❌ Error deleting old featured image from R2:', deleteError);
          }
        }
        
        console.log(`✅ Featured image R2 update completed: ${featuredImageUrl}`);
      } catch (uploadError) {
        console.error('❌ Error uploading new featured image to R2:', uploadError);
        // Keep existing image URL if upload fails
      }
    } else {
      console.log('📸 No new featured image file provided, keeping existing');
    }

    // Prepare update data
    const updateData = {};

    if (pageData.pageName !== undefined) updateData.pageName = pageData.pageName;
    if (pageData.pageTitle !== undefined) updateData.pageTitle = pageData.pageTitle;
    if (pageData.pageDescription !== undefined) updateData.pageDescription = pageData.pageDescription;
    if (pageData.status !== undefined) updateData.status = pageData.status;
    
    // Handle pageContent JSON parsing
    if (pageData.pageContent !== undefined) {
      try {
        updateData.pageContent = typeof pageData.pageContent === 'string' 
          ? JSON.parse(pageData.pageContent) 
          : pageData.pageContent;
      } catch (parseError) {
        console.error('Error parsing pageContent JSON in update:', parseError);
        updateData.pageContent = { htmlContent: '' };
      }
    }
    
    // Only update featured image if a new one was uploaded
    if (featuredImageUrl) {
      updateData.featuredImage = featuredImageUrl;
    }

    // Update slug if pageName changed
    if (pageData.pageName && pageData.pageName !== existingPage.pageName) {
      const newSlug = pageData.pageName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const existingSlug = await findOne(PageContent, { 
        slug: newSlug, 
        _id: { $ne: req.params.id } 
      });
      
      updateData.slug = existingSlug ? `${newSlug}-${Date.now()}` : newSlug;
    }

    const updatedPage = await updateById(PageContent, 
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );

    console.log('✅ Page updated successfully');

    res.json({
      success: true,
      message: 'Page updated successfully',
      data: updatedPage
    });
  } catch (error) {
    console.error('❌ Error updating page:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Page with this ${duplicateField} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update page',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update page status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: draft, published, or archived'
      });
    }

    const updatedPage = await updateById(PageContent, 
      req.params.id, 
      { status }, 
      { new: true, runValidators: true }
    );

    if (!updatedPage) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    res.json({
      success: true,
      message: `Page status updated to ${status}`,
      data: updatedPage
    });
  } catch (error) {
    console.error('Error updating page status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update page status',
      error: error.message
    });
  }
});

// Bulk update page status
router.patch('/bulk/status', async (req, res) => {
  try {
    const { pageIds, status } = req.body;
    
    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'pageIds must be a non-empty array'
      });
    }
    
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: draft, published, or archived'
      });
    }

    const result = await updateMany(PageContent, 
      { _id: { $in: pageIds } }, 
      { status }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} pages to ${status} status`,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      }
    });
  } catch (error) {
    console.error('Error bulk updating page status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update page status',
      error: error.message
    });
  }
});

// Delete page
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting page with ID:', req.params.id);

    const page = await findById(PageContent, req.params.id);
    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    // Delete featured image if it exists
    if (page.featuredImage) {
      try {
        // Extract filename from full URL like "http://localhost:5009/uploads/filename.jpg"
        const filename = page.featuredImage.split('/').pop();
        await deleteImage(filename, 'pages');
        console.log(`Deleted featured image: ${filename}`);
      } catch (deleteError) {
        console.error('Error deleting featured image:', deleteError);
      }
    }

    await deleteById(PageContent, req.params.id);

    console.log('✅ Page deleted successfully');

    res.json({
      success: true,
      message: 'Page deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting page:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete page',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Bulk delete pages
router.delete('/bulk/delete', async (req, res) => {
  try {
    const { pageIds } = req.body;
    
    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'pageIds must be a non-empty array'
      });
    }

    // Get pages to be deleted for featured image cleanup
    const pagesToDelete = await findAll(PageContent, { _id: { $in: pageIds } });
    
    // Delete featured images
    for (const page of pagesToDelete) {
      if (page.featuredImage) {
        try {
          // Extract filename from full URL like "http://localhost:5009/uploads/filename.jpg"
          const filename = page.featuredImage.split('/').pop();
          await deleteImage(filename, 'pages');
          console.log(`Deleted featured image: ${filename}`);
        } catch (deleteError) {
          console.error('Error deleting featured image:', deleteError);
        }
      }
    }

    // Delete pages
    const result = await PageContent.deleteMany({ _id: { $in: pageIds } });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} pages successfully`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('❌ Error bulk deleting pages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk delete pages',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get page statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalPages = await countDocuments(PageContent);
    const publishedPages = await countDocuments(PageContent, { status: 'published' });
    const draftPages = await countDocuments(PageContent, { status: 'draft' });
    const archivedPages = await countDocuments(PageContent, { status: 'archived' });

    res.json({
      success: true,
      message: 'Page statistics fetched successfully',
      data: {
        total: totalPages,
        published: publishedPages,
        draft: draftPages,
        archived: archivedPages,
        percentage: {
          published: totalPages > 0 ? Math.round((publishedPages / totalPages) * 100) : 0,
          draft: totalPages > 0 ? Math.round((draftPages / totalPages) * 100) : 0,
          archived: totalPages > 0 ? Math.round((archivedPages / totalPages) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching page statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch page statistics',
      error: error.message
    });
  }
});

module.exports = router;