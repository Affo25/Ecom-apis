const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

// Import local image handling configuration
const { uploadImage, deleteImage, getImageUrl } = require('../config/cloudinary');

// Debug endpoint to test database connection and products
router.get('/debug', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const productCount = await Product.countDocuments();
    const activeProductCount = await Product.countDocuments({ is_active: true });
    
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
    // Ensure database connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }

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

    // Execute query
    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Product.countDocuments(filter);
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
    const product = await Product.findById(req.params.id).lean();
    
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

// Create new product - Comprehensive creation with all fields
router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    console.log('🆕 Creating new product');
    console.log('📦 Request body:', req.body);
    console.log('📸 Files count:', req.files ? req.files.length : 0);

    const productData = req.body;
    
    // Handle image uploads
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      console.log(`📤 Uploading ${req.files.length} images locally...`);
      
      for (const file of req.files) {
        try {
          const result = await uploadImage(file, 'products');
          imageUrls.push(result.url);
          console.log(`Image uploaded: ${result.url}`);
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
          // Continue with other images if one fails
        }
      }
    }

    // Prepare comprehensive product data
    const newProductData = {
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
    const existingSlug = await Product.findOne({ slug: newProductData.slug });
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

    // Create product with comprehensive data
    const product = new Product(newProductData);
    await product.save();

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
router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    console.log('🔄 Updating product with ID:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📸 Files count:', req.files ? req.files.length : 0);

    const productData = req.body;
    const existingProduct = await Product.findById(req.params.id);
    
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle image operations
    let imageUrls = [...(existingProduct.images || [])];
    
    // Handle image deletions if provided
    if (productData.deletedImages && Array.isArray(productData.deletedImages)) {
      console.log('🗑️ Deleting images:', productData.deletedImages);
      for (const imageUrl of productData.deletedImages) {
        try {
          const filename = imageUrl.split('/').pop();
          await deleteImage(filename);
          imageUrls = imageUrls.filter(url => url !== imageUrl);
          console.log(`Deleted image: ${filename}`);
        } catch (deleteError) {
          console.error('Error deleting image:', deleteError);
        }
      }
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      console.log(`📤 Uploading ${req.files.length} new images locally...`);
      
      for (const file of req.files) {
        try {
          const result = await uploadImage(file, 'products');
          imageUrls.push(result.url);
          console.log(`Image uploaded: ${result.url}`);
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
        }
      }
    }

    // If images are provided directly (replacing all images)
    if (productData.images && Array.isArray(productData.images)) {
      imageUrls = productData.images;
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
      const existingSlug = await Product.findOne({ slug: updateData.slug, _id: { $ne: req.params.id } });
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

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true, 
        runValidators: true,
        omitUndefined: true
      }
    );

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
    const existingProduct = await Product.findById(req.params.id);
    
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
      const existingSlug = await Product.findOne({ slug: updateData.slug, _id: { $ne: req.params.id } });
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

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true, 
        runValidators: true,
        omitUndefined: true
      }
    );

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
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete images from local storage
    if (product.images && product.images.length > 0) {
      for (const imageUrl of product.images) {
        try {
          // Extract filename from URL
          const filename = imageUrl.split('/').pop();
          await deleteImage(filename);
          console.log(`Deleted image: ${filename}`);
        } catch (deleteError) {
          console.error('Error deleting image from local storage:', deleteError);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
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
    const categories = await Product.distinct('categories', { is_active: true });
    
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
    const result = await Product.updateMany(
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

    const product = await Product.findById(req.params.id);
    
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

    const updatedProduct = await Product.findByIdAndUpdate(
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
    const featuredProducts = await Product.find({ 
      is_active: true,
      featured: true 
    })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

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