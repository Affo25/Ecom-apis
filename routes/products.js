const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');

// Import R2 image handling
const R2ImageService = require('../services/R2ImageService');
const { productImageUpload } = require('../middleware/r2Upload');

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

// Debug endpoint to test database connection and products
router.get('/debug', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const productCount = await countDocuments(Product);
    const activeProductCount = await countDocuments(Product, { is_active: true });
    
    res.json({
      success: true,
      message: 'Debug info',
      data: {
        database: dbStatus,
        environment: process.env.NODE_ENV || 'development',
        totalProducts: productCount,
        activeProducts: activeProductCount,
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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10 // Maximum 10 files
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Get all products with filtering and pagination
router.get('/', async (req, res) => {
  try {
    console.log('📦 Fetching products - DB state:', mongoose.connection.readyState);
    
    const {
      category,
      page = 1,
      limit = 12,
      sort = 'newest',
      minPrice,
      maxPrice,
      search
    } = req.query;

    // Build filter object
    const filter = { is_active: true }; // Only show active products

    // Apply filters
    if (category && category !== 'all') {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'price-low':
        sortObj = { price: 1 };
        break;
      case 'price-high':
        sortObj = { price: -1 };
        break;
      case 'name':
        sortObj = { name: 1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
        break;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query using generic service
    const products = await findAll(Product, filter, {
      sort: sortObj,
      skip: skip,
      limit: parseInt(limit),
      lean: true
    });

    // Get total count for pagination
    const total = await countDocuments(Product, filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Products fetched successfully',
      data: {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        }
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await findById(Product, req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product fetched successfully',
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// Create new product with R2 image upload
router.post('/', verifyToken, productImageUpload, async (req, res) => {
  try {
    console.log('🆕 Creating new product with R2');
    console.log('📦 Request body:', req.body);
    console.log('📸 Files:', req.files ? Object.keys(req.files) : 'No files');

    const productData = req.body;
    
    // Handle image uploads to R2
    const imageUrls = [];
    if (req.files && req.files.images && req.files.images.length > 0) {
      console.log(`📤 Uploading ${req.files.images.length} images to R2...`);
      
      try {
        const r2Service = req.r2Service;
        const uploadResults = await r2Service.uploadMultipleImages(req.files.images, 'products');
        imageUrls.push(...uploadResults.map(result => result.url));
        console.log(`✅ R2 Images uploaded: ${imageUrls.length} files`);
      } catch (uploadError) {
        console.error('❌ R2 upload error:', uploadError);
        // Continue without images if upload fails
      }
    }

    // Prepare comprehensive product data
    const newProductData = {
      // Required client_id - use from auth or default
      client_id: req.user?.id || new require('mongoose').Types.ObjectId(),
      
      // Basic Product Information
      name: productData.name || 'Untitled Product',
      description: productData.description || '',
      short_description: productData.short_description || '',
      sku: productData.sku || `SKU-${Date.now()}`,
      brand_id: productData.brand_id || null,

      // Categories and Tags
      categories: productData.categories ? 
        (Array.isArray(productData.categories) ? productData.categories : [productData.categories]) : 
        (productData.category ? [productData.category] : []),
      tags: productData.tags ? 
        (Array.isArray(productData.tags) ? productData.tags : productData.tags.split(',').map(tag => tag.trim())) : 
        [],

      // Pricing
      price: productData.price ? parseFloat(productData.price) : 0,
      sale_price: productData.sale_price ? parseFloat(productData.sale_price) : null,
      currency: productData.currency || 'USD',

      // Stock Management
      quantity_in_stock: productData.quantity_in_stock ? parseInt(productData.quantity_in_stock) : 0,
      stock_status: productData.stock_status || 'in_stock',

      // Physical Attributes
      weight: productData.weight ? parseFloat(productData.weight) : null,
      dimensions: productData.dimensions || {
        length: productData.length ? parseFloat(productData.length) : null,
        width: productData.width ? parseFloat(productData.width) : null,
        height: productData.height ? parseFloat(productData.height) : null
      },
      shipping_class: productData.shipping_class || null,

      // Media
      images: imageUrls,
      videos: productData.videos ? 
        (Array.isArray(productData.videos) ? productData.videos : []) : 
        [],

      // Product Attributes and Variants
      attributes: productData.attributes ? 
        (Array.isArray(productData.attributes) ? productData.attributes : []) : 
        [],
      variants: productData.variants ? 
        (Array.isArray(productData.variants) ? productData.variants : []) : 
        [],

      // SEO Fields
      meta_title: productData.meta_title || productData.name || 'Untitled Product',
      meta_description: productData.meta_description || productData.short_description || productData.description || '',
      meta_keywords: productData.meta_keywords ? 
        (Array.isArray(productData.meta_keywords) ? productData.meta_keywords : productData.meta_keywords.split(',').map(keyword => keyword.trim())) : 
        [],

      // Rating and Reviews
      rating_average: productData.rating_average ? parseFloat(productData.rating_average) : 0,
      rating_count: productData.rating_count ? parseInt(productData.rating_count) : 0,
      reviews: productData.reviews ? 
        (Array.isArray(productData.reviews) ? productData.reviews : []) : 
        [],

      // Status Fields
      featured: productData.featured ? Boolean(productData.featured) : false,
      is_active: productData.is_active !== undefined ? Boolean(productData.is_active) : true,

      // Timestamps
      created_at: new Date(),
      updated_at: new Date()
    };

    // Generate slug from name
    newProductData.slug = newProductData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Ensure slug is unique
    const existingSlug = await findOne(Product, { slug: newProductData.slug });
    if (existingSlug) {
      newProductData.slug = `${newProductData.slug}-${Date.now()}`;
    }

    // Auto-calculate stock status based on quantity
    if (newProductData.quantity_in_stock > 0) {
      newProductData.stock_status = 'in_stock';
    } else {
      newProductData.stock_status = 'out_of_stock';
    }

    console.log('💾 Final comprehensive product data:', newProductData);

    // Create product with comprehensive data using generic service
    const product = await insertOne(Product, newProductData);

    console.log('✅ Product created successfully with all fields');

    res.status(201).json({
      success: true,
      message: 'Product created successfully with all fields',
      data: product,
      created_fields: Object.keys(newProductData)
    });
  } catch (error) {
    console.error('❌ Error creating product:', error);
    
    // Handle specific mongoose errors
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
        message: 'Product with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update product - Comprehensive update with all fields
router.put('/:id', verifyToken, productImageUpload, async (req, res) => {
  try {
    console.log('🔄 Updating product with R2 integration');
    console.log('📦 Request body:', req.body);
    console.log('📸 Files:', req.files ? Object.keys(req.files) : 'No files');

    const productData = req.body;
    const existingProduct = await findById(Product, req.params.id);
    
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle image operations with better logic
    let imageUrls = [];
    
    // Parse JSON strings from FormData
    let deletedImages = [];
    let existingImages = [];
    
    if (productData.deletedImages) {
      try {
        deletedImages = JSON.parse(productData.deletedImages);
        console.log('🗑️ Images to delete:', deletedImages);
      } catch (e) {
        console.error('❌ Error parsing deletedImages:', e);
      }
    }
    
    if (productData.existingImages) {
      try {
        existingImages = JSON.parse(productData.existingImages);
        console.log('📋 Existing images to keep:', existingImages);
      } catch (e) {
        console.error('❌ Error parsing existingImages:', e);
      }
    }
    
    // Start with existing images that should be kept
    if (existingImages.length > 0) {
      imageUrls = [...existingImages];
    }
    
    // Handle image deletions from R2
    if (deletedImages.length > 0) {
      console.log('🗑️ Deleting images from R2:', deletedImages);
      const r2Service = req.r2Service;
      
      for (const imageUrl of deletedImages) {
        try {
          await r2Service.deleteImage(imageUrl);
          console.log(`✅ Deleted image from R2: ${imageUrl}`);
        } catch (deleteError) {
          console.error('❌ Error deleting image from R2:', deleteError);
        }
      }
    }

    // Handle new image uploads to R2
    if (req.files && req.files.images && req.files.images.length > 0) {
      console.log(`📤 Uploading ${req.files.images.length} new images to R2...`);
      
      try {
        const r2Service = req.r2Service;
        const uploadResults = await r2Service.uploadMultipleImages(req.files.images, 'products');
        const newImageUrls = uploadResults.map(result => result.url);
        imageUrls.push(...newImageUrls);
        console.log(`✅ R2 Images uploaded: ${newImageUrls.length} files`);
        console.log('📍 New image URLs:', newImageUrls);
      } catch (uploadError) {
        console.error('❌ R2 upload error:', uploadError);
        // Continue without the failed uploads but log the error
      }
    }
    
    console.log('📊 Final image URLs for product:', imageUrls.length, 'images');

    // Prepare comprehensive update data
    const updateData = {
      updated_at: new Date()
    };

    // Basic Product Information
    if (productData.name !== undefined) updateData.name = productData.name;
    if (productData.description !== undefined) updateData.description = productData.description;
    if (productData.short_description !== undefined) updateData.short_description = productData.short_description;
    if (productData.sku !== undefined) updateData.sku = productData.sku;
    if (productData.brand_id !== undefined) updateData.brand_id = productData.brand_id;

    // Categories and Tags
    if (productData.categories !== undefined) updateData.categories = Array.isArray(productData.categories) ? productData.categories : [productData.categories];
    if (productData.category !== undefined) updateData.categories = [productData.category];
    if (productData.tags !== undefined) updateData.tags = Array.isArray(productData.tags) ? productData.tags : productData.tags.split(',').map(tag => tag.trim());

    // Pricing
    if (productData.price !== undefined) updateData.price = parseFloat(productData.price);
    if (productData.sale_price !== undefined) updateData.sale_price = productData.sale_price ? parseFloat(productData.sale_price) : null;
    if (productData.currency !== undefined) updateData.currency = productData.currency;

    // Stock Management
    if (productData.quantity_in_stock !== undefined) updateData.quantity_in_stock = parseInt(productData.quantity_in_stock);
    if (productData.stock_status !== undefined) updateData.stock_status = productData.stock_status;

    // Physical Attributes
    if (productData.weight !== undefined) updateData.weight = productData.weight ? parseFloat(productData.weight) : null;
    if (productData.dimensions !== undefined) updateData.dimensions = productData.dimensions;
    if (productData.shipping_class !== undefined) updateData.shipping_class = productData.shipping_class;

    // Media
    updateData.images = imageUrls;
    if (productData.videos !== undefined) updateData.videos = Array.isArray(productData.videos) ? productData.videos : [];

    // Product Attributes and Variants
    if (productData.attributes !== undefined) {
      updateData.attributes = Array.isArray(productData.attributes) ? productData.attributes : [];
    }
    if (productData.variants !== undefined) {
      updateData.variants = Array.isArray(productData.variants) ? productData.variants : [];
    }

    // SEO Fields
    if (productData.meta_title !== undefined) updateData.meta_title = productData.meta_title;
    if (productData.meta_description !== undefined) updateData.meta_description = productData.meta_description;
    if (productData.meta_keywords !== undefined) {
      updateData.meta_keywords = Array.isArray(productData.meta_keywords) 
        ? productData.meta_keywords 
        : productData.meta_keywords.split(',').map(keyword => keyword.trim());
    }

    // Rating and Reviews (usually calculated, but allow manual setting)
    if (productData.rating_average !== undefined) updateData.rating_average = parseFloat(productData.rating_average);
    if (productData.rating_count !== undefined) updateData.rating_count = parseInt(productData.rating_count);
    if (productData.reviews !== undefined) updateData.reviews = Array.isArray(productData.reviews) ? productData.reviews : [];

    // Status Fields
    if (productData.featured !== undefined) updateData.featured = Boolean(productData.featured);
    if (productData.is_active !== undefined) updateData.is_active = Boolean(productData.is_active);

    // Generate slug if name is being updated
    if (updateData.name && updateData.name !== existingProduct.name) {
      updateData.slug = updateData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Ensure slug is unique
      const existingSlug = await findOne(Product, { slug: updateData.slug, _id: { $ne: req.params.id } });
      if (existingSlug) {
        updateData.slug = `${updateData.slug}-${Date.now()}`;
      }
    }

    // Auto-calculate stock status based on quantity
    if (updateData.quantity_in_stock !== undefined) {
      if (updateData.quantity_in_stock > 0) {
        updateData.stock_status = 'in_stock';
      } else {
        updateData.stock_status = 'out_of_stock';
      }
    }

    console.log('💾 Final comprehensive update data:', updateData);

    // Update product using generic service
    const updatedProduct = await updateById(Product, req.params.id, updateData, { 
      runValidators: true,
      omitUndefined: true
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found after update'
      });
    }

    console.log('✅ Product updated successfully with all fields');

    res.json({
      success: true,
      message: 'Product updated successfully with all fields',
      data: updatedProduct,
      updated_fields: Object.keys(updateData)
    });
  } catch (error) {
    console.error('❌ Error updating product:', error);
    
    // Handle specific mongoose errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Product with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// PATCH method for partial updates (without file uploads) - Comprehensive
router.patch('/:id', async (req, res) => {
  try {
    console.log('🔄 Partially updating product with ID:', req.params.id);
    console.log('📦 Request body:', req.body);

    const productData = req.body;
    const existingProduct = await findById(Product, req.params.id);
    
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Prepare comprehensive update data
    const updateData = {
      updated_at: new Date()
    };

    // Basic Product Information
    if (productData.name !== undefined) updateData.name = productData.name;
    if (productData.description !== undefined) updateData.description = productData.description;
    if (productData.short_description !== undefined) updateData.short_description = productData.short_description;
    if (productData.sku !== undefined) updateData.sku = productData.sku;
    if (productData.brand_id !== undefined) updateData.brand_id = productData.brand_id;

    // Categories and Tags
    if (productData.categories !== undefined) updateData.categories = Array.isArray(productData.categories) ? productData.categories : [productData.categories];
    if (productData.category !== undefined) updateData.categories = [productData.category];
    if (productData.tags !== undefined) updateData.tags = Array.isArray(productData.tags) ? productData.tags : productData.tags.split(',').map(tag => tag.trim());

    // Pricing
    if (productData.price !== undefined) updateData.price = parseFloat(productData.price);
    if (productData.sale_price !== undefined) updateData.sale_price = productData.sale_price ? parseFloat(productData.sale_price) : null;
    if (productData.currency !== undefined) updateData.currency = productData.currency;

    // Stock Management
    if (productData.quantity_in_stock !== undefined) updateData.quantity_in_stock = parseInt(productData.quantity_in_stock);
    if (productData.stock_status !== undefined) updateData.stock_status = productData.stock_status;

    // Physical Attributes
    if (productData.weight !== undefined) updateData.weight = productData.weight ? parseFloat(productData.weight) : null;
    if (productData.dimensions !== undefined) updateData.dimensions = productData.dimensions;
    if (productData.shipping_class !== undefined) updateData.shipping_class = productData.shipping_class;

    // Media (URLs only, no file uploads in PATCH)
    if (productData.images !== undefined) updateData.images = Array.isArray(productData.images) ? productData.images : [];
    if (productData.videos !== undefined) updateData.videos = Array.isArray(productData.videos) ? productData.videos : [];

    // Product Attributes and Variants
    if (productData.attributes !== undefined) {
      updateData.attributes = Array.isArray(productData.attributes) ? productData.attributes : [];
    }
    if (productData.variants !== undefined) {
      updateData.variants = Array.isArray(productData.variants) ? productData.variants : [];
    }

    // SEO Fields
    if (productData.meta_title !== undefined) updateData.meta_title = productData.meta_title;
    if (productData.meta_description !== undefined) updateData.meta_description = productData.meta_description;
    if (productData.meta_keywords !== undefined) {
      updateData.meta_keywords = Array.isArray(productData.meta_keywords) 
        ? productData.meta_keywords 
        : productData.meta_keywords.split(',').map(keyword => keyword.trim());
    }

    // Rating and Reviews
    if (productData.rating_average !== undefined) updateData.rating_average = parseFloat(productData.rating_average);
    if (productData.rating_count !== undefined) updateData.rating_count = parseInt(productData.rating_count);
    if (productData.reviews !== undefined) updateData.reviews = Array.isArray(productData.reviews) ? productData.reviews : [];

    // Status Fields
    if (productData.featured !== undefined) updateData.featured = Boolean(productData.featured);
    if (productData.is_active !== undefined) updateData.is_active = Boolean(productData.is_active);

    // Generate slug if name is being updated
    if (updateData.name && updateData.name !== existingProduct.name) {
      updateData.slug = updateData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Ensure slug is unique
      const existingSlug = await findOne(Product, { slug: updateData.slug, _id: { $ne: req.params.id } });
      if (existingSlug) {
        updateData.slug = `${updateData.slug}-${Date.now()}`;
      }
    }

    // Auto-calculate stock status based on quantity
    if (updateData.quantity_in_stock !== undefined) {
      if (updateData.quantity_in_stock > 0) {
        updateData.stock_status = 'in_stock';
      } else {
        updateData.stock_status = 'out_of_stock';
      }
    }

    console.log('💾 Final comprehensive patch data:', updateData);

    // Update product using generic service
    const updatedProduct = await updateById(Product, req.params.id, updateData, { 
      runValidators: true,
      omitUndefined: true
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found after update'
      });
    }

    console.log('✅ Product patched successfully with all fields');

    res.json({
      success: true,
      message: 'Product patched successfully with all fields',
      data: updatedProduct,
      updated_fields: Object.keys(updateData)
    });
  } catch (error) {
    console.error('❌ Error patching product:', error);
    
    // Handle specific mongoose errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Product with this slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to patch product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete product
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    console.log('🗑️ Deleting product with ID:', req.params.id);
    
    const product = await findById(Product, req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete images from R2 storage
    if (product.images && product.images.length > 0) {
      console.log(`📸 Deleting ${product.images.length} images from R2...`);
      const r2Service = req.r2Service || new (require('../services/R2ImageService'))();
      
      for (const imageUrl of product.images) {
        try {
          await r2Service.deleteImage(imageUrl);
          console.log(`✅ Deleted image from R2: ${imageUrl}`);
        } catch (deleteError) {
          console.error('❌ Error deleting image from R2:', deleteError);
          // Continue with other deletions even if one fails
        }
      }
    }

    await deleteById(Product, req.params.id);

    console.log('✅ Product deleted successfully');
    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: { deletedProductId: req.params.id }
    });
  } catch (error) {
    console.error('❌ Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// Get product categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await distinct(Product, 'categories', { is_active: true });
    
    res.json({
      success: true,
      message: 'Categories fetched successfully',
      data: categories
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

// Get product fields info
router.get('/fields/info', async (req, res) => {
  try {
    const fieldsInfo = {
      basic_info: {
        name: { type: 'String', required: true, description: 'Product name' },
        description: { type: 'String', required: false, description: 'Full product description' },
        short_description: { type: 'String', required: false, description: 'Brief product description' },
        sku: { type: 'String', required: false, description: 'Stock keeping unit' },
        brand_id: { type: 'String', required: false, description: 'Brand identifier' },
        slug: { type: 'String', required: true, description: 'URL-friendly product identifier (auto-generated)' }
      },
      categories_tags: {
        categories: { type: 'Array[String]', required: false, description: 'Product categories' },
        tags: { type: 'Array[String]', required: false, description: 'Product tags' }
      },
      pricing: {
        price: { type: 'Number', required: true, description: 'Regular price' },
        sale_price: { type: 'Number', required: false, description: 'Sale price (optional)' },
        currency: { type: 'String', required: false, default: 'USD', description: 'Currency code' }
      },
      stock: {
        quantity_in_stock: { type: 'Number', required: false, default: 0, description: 'Available quantity' },
        stock_status: { type: 'String', enum: ['in_stock', 'out_of_stock', 'preorder'], default: 'in_stock', description: 'Stock status' }
      },
      physical: {
        weight: { type: 'Number', required: false, description: 'Product weight' },
        dimensions: { type: 'Object', required: false, description: 'Product dimensions (length, width, height)' },
        shipping_class: { type: 'String', required: false, description: 'Shipping class' }
      },
      media: {
        images: { type: 'Array[String]', required: false, description: 'Product image URLs' },
        videos: { type: 'Array[String]', required: false, description: 'Product video URLs' }
      },
      attributes: {
        attributes: { type: 'Array[Object]', required: false, description: 'Product attributes (color, size, etc.)' },
        variants: { type: 'Array[Object]', required: false, description: 'Product variants' }
      },
      seo: {
        meta_title: { type: 'String', required: false, description: 'SEO title' },
        meta_description: { type: 'String', required: false, description: 'SEO description' },
        meta_keywords: { type: 'Array[String]', required: false, description: 'SEO keywords' }
      },
      ratings: {
        rating_average: { type: 'Number', required: false, default: 0, description: 'Average rating' },
        rating_count: { type: 'Number', required: false, default: 0, description: 'Number of ratings' },
        reviews: { type: 'Array[Object]', required: false, description: 'Product reviews' }
      },
      status: {
        featured: { type: 'Boolean', required: false, default: false, description: 'Featured product' },
        is_active: { type: 'Boolean', required: false, default: true, description: 'Product visibility' }
      },
      timestamps: {
        created_at: { type: 'Date', required: false, description: 'Creation timestamp (auto-generated)' },
        updated_at: { type: 'Date', required: false, description: 'Last update timestamp (auto-generated)' }
      }
    };

    res.json({
      success: true,
      message: 'Product fields information',
      data: fieldsInfo,
      endpoints: {
        create: 'POST /api/products',
        update: 'PUT /api/products/:id',
        patch: 'PATCH /api/products/:id',
        delete: 'DELETE /api/products/:id',
        get_single: 'GET /api/products/:id',
        get_all: 'GET /api/products',
        categories: 'GET /api/products/categories/list',
        featured: 'GET /api/products/featured/list'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching fields info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fields info',
      error: error.message
    });
  }
});

// Bulk update products
router.patch('/bulk/update', async (req, res) => {
  try {
    console.log('🔄 Bulk updating products');
    console.log('📦 Request body:', req.body);

    const { productIds, updateData } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array is required'
      });
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Update data is required'
      });
    }

    // Prepare update data
    const bulkUpdateData = {
      ...updateData,
      updated_at: new Date()
    };

    // Handle data type conversions
    if (bulkUpdateData.price) bulkUpdateData.price = parseFloat(bulkUpdateData.price);
    if (bulkUpdateData.sale_price) bulkUpdateData.sale_price = parseFloat(bulkUpdateData.sale_price);
    if (bulkUpdateData.quantity_in_stock) bulkUpdateData.quantity_in_stock = parseInt(bulkUpdateData.quantity_in_stock);
    if (bulkUpdateData.weight) bulkUpdateData.weight = parseFloat(bulkUpdateData.weight);
    if (bulkUpdateData.featured !== undefined) bulkUpdateData.featured = Boolean(bulkUpdateData.featured);
    if (bulkUpdateData.is_active !== undefined) bulkUpdateData.is_active = Boolean(bulkUpdateData.is_active);

    // Perform bulk update
    const result = await updateMany(Product,
      { _id: { $in: productIds } },
      { $set: bulkUpdateData },
      { runValidators: true }
    );

    res.json({
      success: true,
      message: 'Bulk update completed',
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        acknowledged: result.acknowledged
      }
    });
  } catch (error) {
    console.error('❌ Bulk update failed:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk update failed',
      error: error.message
    });
  }
});

// Test update endpoint
router.post('/test-update/:id', async (req, res) => {
  try {
    console.log('🧪 Testing product update with ID:', req.params.id);
    console.log('📦 Test data:', req.body);

    const product = await findById(Product, req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Test a simple update
    const testUpdate = {
      name: req.body.name || product.name,
      price: req.body.price || product.price,
      description: req.body.description || product.description,
      updated_at: new Date()
    };

    const updatedProduct = await updateById(Product,
      req.params.id,
      testUpdate,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Test update successful',
      data: {
        before: product,
        after: updatedProduct
      }
    });
  } catch (error) {
    console.error('❌ Test update failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test update failed',
      error: error.message
    });
  }
});

// Update product status
router.patch('/:id/status', async (req, res) => {
  try {
    const { is_active } = req.body;
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { is_active },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product status updated successfully',
      data: product
    });
  } catch (error) {
    console.error('Error updating product status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product status',
      error: error.message
    });
  }
});

// Add featured products endpoint
router.get('/featured/list', async (req, res) => {
  try {
    const featuredProducts = await findAll(Product, { 
      is_active: true,
      featured: true 
    }, {
      sort: { createdAt: -1 },
      limit: 8,
      lean: true
    });

    res.json({
      success: true,
      message: 'Featured products fetched successfully',
      data: featuredProducts
    });
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured products',
      error: error.message
    });
  }
});

module.exports = router;