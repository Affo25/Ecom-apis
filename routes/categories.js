const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const multer = require('multer');
const mongoose = require('mongoose');
const { uploadImage, deleteImage } = require('../config/cloudinary');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 1 // Maximum 1 file for category image
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Get all categories with filtering, sorting, and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'created_at',
      order = 'desc',
      name,
      is_active,
      is_featured
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

    // Build sort object
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const categories = await Category.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Category.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Categories fetched successfully',
      data: {
        categories,
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
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// Get all categories (simplified for dropdowns)
router.get('/all', async (req, res) => {
  try {
    const categories = await Category.find({ is_active: true })
      .select('_id name slug')
      .sort({ sort_order: 1, name: 1 })
      .lean();

    res.json({
      success: true,
      message: 'Categories fetched successfully',
      data: categories
    });
  } catch (error) {
    console.error('Error fetching all categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// Get single category
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .lean();
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      message: 'Category fetched successfully',
      data: category
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category',
      error: error.message
    });
  }
});

// Create new category
router.post('/', upload.single('image'), async (req, res) => {
  try {
    console.log('🆕 Creating new category');
    console.log('📦 Request body:', req.body);
    console.log('📸 File:', req.file ? 'Yes' : 'No');

    const categoryData = req.body;
    
    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      try {
        const result = await uploadImage(req.file, 'categories');
        imageUrl = result.url;
        console.log(`Image uploaded: ${imageUrl}`);
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
      }
    }

    // Generate slug from name
    const slug = categoryData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Ensure slug is unique
    const existingSlug = await Category.findOne({ slug });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    // Prepare category data
    const newCategoryData = {
      name: categoryData.name || 'Untitled Category',
      slug: finalSlug,
      description: categoryData.description || '',
      image: imageUrl,
      icon: categoryData.icon || null,
      color: categoryData.color || '#6B7280',
      sort_order: categoryData.sort_order ? parseInt(categoryData.sort_order) : 0,
      is_active: categoryData.is_active !== undefined ? Boolean(categoryData.is_active) : true,
      is_featured: categoryData.is_featured !== undefined ? Boolean(categoryData.is_featured) : false,
      product_count: 0,
      meta_title: categoryData.meta_title || categoryData.name || 'Untitled Category',
      meta_description: categoryData.meta_description || categoryData.description || '',
      meta_keywords: categoryData.meta_keywords ? 
        (Array.isArray(categoryData.meta_keywords) 
          ? categoryData.meta_keywords 
          : categoryData.meta_keywords.split(',').map(keyword => keyword.trim())) 
        : [],
      created_at: new Date(),
      updated_at: new Date()
    };

    console.log('💾 Final category data:', newCategoryData);

    // Create category
    const category = new Category(newCategoryData);
    await category.save();

    console.log('✅ Category created successfully');

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    console.error('❌ Error creating category:', error);
    
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
        message: 'Category with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update category
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    console.log('🔄 Updating category with ID:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📸 File:', req.file ? 'Yes' : 'No');

    const categoryData = req.body;
    const existingCategory = await Category.findById(req.params.id);
    
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Handle image operations
    let imageUrl = existingCategory.image;
    
    // Handle new image upload
    if (req.file) {
      try {
        const result = await uploadImage(req.file, 'categories');
        imageUrl = result.url;
        
        // Delete old image if exists
        if (existingCategory.image) {
          try {
            const filename = existingCategory.image.split('/').pop();
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

    if (categoryData.name !== undefined) updateData.name = categoryData.name;
    if (categoryData.description !== undefined) updateData.description = categoryData.description;
    if (imageUrl !== undefined) updateData.image = imageUrl;
    if (categoryData.icon !== undefined) updateData.icon = categoryData.icon;
    if (categoryData.color !== undefined) updateData.color = categoryData.color;
    if (categoryData.sort_order !== undefined) updateData.sort_order = parseInt(categoryData.sort_order);
    if (categoryData.is_active !== undefined) updateData.is_active = Boolean(categoryData.is_active);
    if (categoryData.is_featured !== undefined) updateData.is_featured = Boolean(categoryData.is_featured);
    if (categoryData.meta_title !== undefined) updateData.meta_title = categoryData.meta_title;
    if (categoryData.meta_description !== undefined) updateData.meta_description = categoryData.meta_description;
    if (categoryData.meta_keywords !== undefined) {
      updateData.meta_keywords = Array.isArray(categoryData.meta_keywords) 
        ? categoryData.meta_keywords 
        : categoryData.meta_keywords.split(',').map(keyword => keyword.trim());
    }

    // Update slug if name changed
    if (categoryData.name && categoryData.name !== existingCategory.name) {
      const newSlug = categoryData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const existingSlug = await Category.findOne({ 
        slug: newSlug, 
        _id: { $ne: req.params.id } 
      });
      
      updateData.slug = existingSlug ? `${newSlug}-${Date.now()}` : newSlug;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log('✅ Category updated successfully');

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: updatedCategory
    });
  } catch (error) {
    console.error('❌ Error updating category:', error);
    
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
        message: 'Category with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting category with ID:', req.params.id);

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

   

    // Delete category image if exists
    if (category.image) {
      try {
        const filename = category.image.split('/').pop();
        await deleteImage(filename);
        console.log(`Deleted image: ${filename}`);
      } catch (deleteError) {
        console.error('Error deleting image:', deleteError);
      }
    }

    await Category.findByIdAndDelete(req.params.id);

    console.log('✅ Category deleted successfully');

    res.json({
      success: true,
      message: 'Category deleted successfully',
      data: { deletedId: req.params.id }
    });
  } catch (error) {
    console.error('❌ Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;