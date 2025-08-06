const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const multer = require('multer');
const mongoose = require('mongoose');
const { uploadImage, deleteImage } = require('../config/cloudinary');

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
    files: 1 // Maximum 1 file for subcategory image
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Get all subcategories with filtering, sorting, and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'created_at',
      order = 'desc',
      name,
      is_active,
      is_featured,
      parent_id
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (name && name.trim()) {
      filter.name = { $regex: name.trim(), $options: 'i' };
    }
    
    if (is_active !== undefined && is_active !== '') {
      filter.is_active = is_active === 'true';
    }
    
    if (is_featured !== undefined && is_featured !== '') {
      filter.is_featured = is_featured === 'true';
    }
    
    if (parent_id !== undefined && parent_id !== '') {
      filter.parent_id = parent_id;
    }

    // Build sort object
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with generic service
    const subcategories = await findAll(Subcategory, filter, {
      sort: sortObj,
      skip: skip,
      limit: parseInt(limit),
      lean: true
    });

    // Get total count for pagination
    const total = await countDocuments(Subcategory, filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Subcategories fetched successfully',
      data: {
        subcategories,
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
    console.error('Error fetching subcategories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subcategories',
      error: error.message
    });
  }
});

// Get subcategories by parent category ID
router.get('/by-parent/:parentId', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { is_active = 'true' } = req.query;

    const filter = { parent_id: parentId };
    if (is_active !== 'all') {
      filter.is_active = is_active === 'true';
    }

    const subcategories = await findAll(Subcategory, filter)
      .sort({ sort_order: 1, name: 1 })
      .lean();

    res.json({
      success: true,
      message: 'Subcategories fetched successfully',
      data: subcategories
    });
  } catch (error) {
    console.error('Error fetching subcategories by parent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subcategories',
      error: error.message
    });
  }
});

// Get all subcategories (simplified for dropdowns)
router.get('/all', async (req, res) => {
  try {
    const { parent_id } = req.query;
    
    const filter = {
      is_active: true
    };

    if (parent_id) {
      filter.parent_id = parent_id;
    }

    const subcategories = await findAll(Subcategory, filter)
      .select('_id name slug parent_id sort_order')
      .sort({ sort_order: 1, name: 1 })
      .lean();

    res.json({
      success: true,
      message: 'Subcategories fetched successfully',
      data: subcategories
    });
  } catch (error) {
    console.error('Error fetching all subcategories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subcategories',
      error: error.message
    });
  }
});

// Get single subcategory
router.get('/:id', async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id)
      .populate('parent_id', 'name slug color')
      .lean();
    
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    res.json({
      success: true,
      message: 'Subcategory fetched successfully',
      data: subcategory
    });
  } catch (error) {
    console.error('Error fetching subcategory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subcategory',
      error: error.message
    });
  }
});



// Create new subcategory
router.post('/', upload.single('image'), async (req, res) => {
  try {
    console.log('🆕 Creating new subcategory');
    console.log('📦 Request body:', req.body);

    const subcategoryData = req.body;
    console.log('📦 subcategoryData:', subcategoryData);
    
    // Basic validation - ensure we have data
    if (!subcategoryData || typeof subcategoryData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data'
      });
    }
    
    // Validate required fields
    if (!subcategoryData.name || !subcategoryData.parent_id) {
      return res.status(400).json({
        success: false,
        message: 'Name and parent_id are required fields'
      });
    }

    // Verify parent category exists
    const parentCategory = await Category.findById(subcategoryData.parent_id);
    if (!parentCategory) {
      return res.status(400).json({
        success: false,
        message: 'Parent category not found'
      });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      try {
        const result = await uploadImage(req.file, 'subcategories');
        imageUrl = result.url;
        console.log(`Image uploaded: ${imageUrl}`);
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
      }
    }

    // Generate slug from name
    const slug = subcategoryData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Ensure slug is unique
    const existingSlug = await Subcategory.findOne({ slug });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    // Prepare subcategory data with proper boolean handling
    const newSubcategoryData = {
      name: subcategoryData.name,
      slug: finalSlug,
      description: subcategoryData.description || '',
      parent_id: subcategoryData.parent_id,
      image: imageUrl,
      icon: subcategoryData.icon || null,
      color: subcategoryData.color || parentCategory.color || '#6B7280',
      sort_order: subcategoryData.sort_order ? parseInt(subcategoryData.sort_order) : 0,
      is_active: subcategoryData.is_active === 'false' ? false : true,
      is_featured: subcategoryData.is_featured === 'true' ? true : false,
      product_count: 0,
      meta_title: subcategoryData.meta_title || subcategoryData.name,
      meta_description: subcategoryData.meta_description || subcategoryData.description || '',
      meta_keywords: subcategoryData.meta_keywords ? 
        (Array.isArray(subcategoryData.meta_keywords) 
          ? subcategoryData.meta_keywords 
          : subcategoryData.meta_keywords.split(',').map(keyword => keyword.trim())) 
        : []
    };

    console.log('💾 Final subcategory data:', newSubcategoryData);

    // Create and save subcategory
    const subcategory = new Subcategory(newSubcategoryData);
    await subcategory.save();
    
    console.log('✅ Subcategory saved successfully');

    // Populate parent data for response  
    await subcategory.populate('parent_id', 'name slug color');
    console.log('✅ Subcategory populated successfully');

    res.status(201).json({
      success: true,
      message: 'Subcategory created successfully',
      data: subcategory
    });
  } catch (error) {
    console.error('❌ Error creating subcategory:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create subcategory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update subcategory
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    console.log('🔄 Updating subcategory with ID:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📸 File:', req.file ? 'Yes' : 'No');

    const subcategoryData = req.body;
    const existingSubcategory = await findById(Subcategory, req.params.id);
    
    if (!existingSubcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    // Validate parent_id if being changed
    if (subcategoryData.parent_id && subcategoryData.parent_id !== 'null') {
      const parentCategory = await Category.findById(subcategoryData.parent_id);
      if (!parentCategory) {
        return res.status(400).json({
          success: false,
          message: 'Parent category not found'
        });
      }
    }

    // Handle image operations
    let imageUrl = existingSubcategory.image;
    
    // Handle new image upload
    if (req.file) {
      try {
        const result = await uploadImage(req.file, 'subcategories');
        imageUrl = result.url;
        
        // Delete old image if exists
        if (existingSubcategory.image) {
          try {
            const filename = existingSubcategory.image.split('/').pop();
            await deleteImage(filename);
          } catch (deleteError) {
            console.error('Error deleting old image:', deleteError);
          }
        }
        
        console.log(`New image uploaded: ${imageUrl}`);
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
      }
    }

    // Prepare update data
    const updateData = {
      updated_at: new Date()
    };

    if (subcategoryData.name !== undefined) updateData.name = subcategoryData.name;
    if (subcategoryData.description !== undefined) updateData.description = subcategoryData.description;
    if (subcategoryData.parent_id !== undefined && subcategoryData.parent_id !== 'null') {
      updateData.parent_id = subcategoryData.parent_id;
    }
    if (imageUrl !== undefined) updateData.image = imageUrl;
    if (subcategoryData.icon !== undefined) updateData.icon = subcategoryData.icon;
    if (subcategoryData.color !== undefined) updateData.color = subcategoryData.color;
    if (subcategoryData.sort_order !== undefined) updateData.sort_order = parseInt(subcategoryData.sort_order);
    if (subcategoryData.is_active !== undefined) updateData.is_active = Boolean(subcategoryData.is_active);
    if (subcategoryData.is_featured !== undefined) updateData.is_featured = Boolean(subcategoryData.is_featured);
    if (subcategoryData.meta_title !== undefined) updateData.meta_title = subcategoryData.meta_title;
    if (subcategoryData.meta_description !== undefined) updateData.meta_description = subcategoryData.meta_description;
    if (subcategoryData.meta_keywords !== undefined) {
      updateData.meta_keywords = Array.isArray(subcategoryData.meta_keywords) 
        ? subcategoryData.meta_keywords 
        : subcategoryData.meta_keywords.split(',').map(keyword => keyword.trim());
    }

    // Update slug if name changed
    if (subcategoryData.name && subcategoryData.name !== existingSubcategory.name) {
      const newSlug = subcategoryData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const existingSlug = await Subcategory.findOne({ 
        slug: newSlug, 
        _id: { $ne: req.params.id } 
      });
      
      updateData.slug = existingSlug ? `${newSlug}-${Date.now()}` : newSlug;
    }

    const updatedSubcategory = await Subcategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('parent_id', 'name slug color');

    console.log('✅ Subcategory updated successfully');

    res.json({
      success: true,
      message: 'Subcategory updated successfully',
      data: updatedSubcategory
    });
  } catch (error) {
    console.error('❌ Error updating subcategory:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update subcategory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete subcategory
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting subcategory with ID:', req.params.id);

    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    // Delete subcategory image if exists
    if (subcategory.image) {
      try {
        const filename = subcategory.image.split('/').pop();
        await deleteImage(filename);
        console.log(`Deleted image: ${filename}`);
      } catch (deleteError) {
        console.error('Error deleting image:', deleteError);
      }
    }

    await Subcategory.findByIdAndDelete(req.params.id);

    console.log('✅ Subcategory deleted successfully');

    res.json({
      success: true,
      message: 'Subcategory deleted successfully',
      data: { deletedId: req.params.id }
    });
  } catch (error) {
    console.error('❌ Error deleting subcategory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subcategory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get category hierarchy (categories with their subcategories)
router.get('/hierarchy/all', async (req, res) => {
  try {
    // Get all parent categories (categories without parent_id)
    const parentCategories = await Category.find({ 
      parent_id: null, 
      is_active: true 
    })
    .select('_id name slug color sort_order')
    .sort({ sort_order: 1, name: 1 })
    .lean();

    // Get all subcategories
    const subcategories = await Subcategory.find({ 
      is_active: true 
    })
    .select('_id name slug color parent_id sort_order')
    .sort({ sort_order: 1, name: 1 })
    .lean();

    // Organize subcategories under their parents
    const hierarchy = parentCategories.map(parent => ({
      ...parent,
      subcategories: subcategories.filter(sub => 
        sub.parent_id && sub.parent_id.toString() === parent._id.toString()
      )
    }));

    res.json({
      success: true,
      message: 'Category hierarchy fetched successfully',
      data: hierarchy
    });
  } catch (error) {
    console.error('Error fetching category hierarchy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category hierarchy',
      error: error.message
    });
  }
});

module.exports = router;