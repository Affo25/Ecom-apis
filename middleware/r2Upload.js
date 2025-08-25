/**
 * R2 Upload Middleware
 * Middleware for handling file uploads with Cloudflare R2 integration
 */

const multer = require('multer');
const R2ImageService = require('../services/R2ImageService');

// Configure multer for memory storage (files will be uploaded to R2)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else if (file.mimetype === 'application/pdf' && file.fieldname === 'bikeDocument') {
    // Allow PDF for bike documents
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs (for documents) are allowed.'), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Initialize R2 service
const r2Service = new R2ImageService();

/**
 * Middleware factory for different upload scenarios
 */
const createR2UploadMiddleware = (fieldConfig) => {
  return [
    upload.fields(fieldConfig),
    async (req, res, next) => {
      try {
        // Add R2 service to request object for use in route handlers
        req.r2Service = r2Service;
        
        // Process uploaded files if any
        if (req.files) {
          console.log('📁 Files received for R2 upload:', Object.keys(req.files));
          
          // Add file validation
          for (const fieldName in req.files) {
            const files = req.files[fieldName];
            for (const file of files) {
              if (!file.buffer) {
                throw new Error(`File ${file.originalname} has no buffer data`);
              }
            }
          }
        }
        
        next();
      } catch (error) {
        console.error('❌ R2 Upload Middleware Error:', error);
        res.status(400).json({ 
          success: false, 
          message: error.message || 'File upload processing failed' 
        });
      }
    }
  ];
};

// Predefined middleware configurations for different entities

/**
 * Product image upload middleware
 * Handles multiple product images
 */
const productImageUpload = createR2UploadMiddleware([
  { name: 'images', maxCount: 10 }
]);

/**
 * Category image upload middleware
 * Handles category image and icon
 */
const categoryImageUpload = createR2UploadMiddleware([
  { name: 'image', maxCount: 1 },
  { name: 'icon', maxCount: 1 }
]);

/**
 * Subcategory image upload middleware
 * Handles subcategory image and icon
 */
const subcategoryImageUpload = createR2UploadMiddleware([
  { name: 'image', maxCount: 1 },
  { name: 'icon', maxCount: 1 }
]);

/**
 * Rider image upload middleware
 * Handles rider profile image, CNIC images, and documents
 */
const riderImageUpload = createR2UploadMiddleware([
  { name: 'image', maxCount: 1 },
  { name: 'cnicFrontImage', maxCount: 1 },
  { name: 'cnicBackImage', maxCount: 1 },
  { name: 'bikeDocument', maxCount: 1 }
]);

/**
 * CMS image upload middleware
 * Handles banner images, logo, and favicon
 */
const cmsImageUpload = createR2UploadMiddleware([
  { name: 'bannerImages', maxCount: 5 },
  { name: 'logoImage', maxCount: 1 },
  { name: 'faviconImage', maxCount: 1 }
]);

/**
 * Generic single image upload middleware
 */
const singleImageUpload = createR2UploadMiddleware([
  { name: 'image', maxCount: 1 }
]);

/**
 * Generic multiple image upload middleware
 */
const multipleImageUpload = createR2UploadMiddleware([
  { name: 'images', maxCount: 10 }
]);

/**
 * Helper function to upload files and get URLs
 * @param {Object} files - Files from multer
 * @param {string} category - Upload category
 * @param {string} subCategory - Upload subcategory
 * @returns {Promise<Object>} Upload results
 */
const uploadFilesToR2 = async (files, category, subCategory = '') => {
  const uploadResults = {};
  
  for (const fieldName in files) {
    const fileArray = files[fieldName];
    
    if (fileArray.length === 1) {
      // Single file
      const result = await r2Service.uploadSingleImage(fileArray[0], category, subCategory);
      uploadResults[fieldName] = result.url;
    } else {
      // Multiple files
      const results = await r2Service.uploadMultipleImages(fileArray, category, subCategory);
      uploadResults[fieldName] = results.map(r => r.url);
    }
  }
  
  return uploadResults;
};

module.exports = {
  createR2UploadMiddleware,
  productImageUpload,
  categoryImageUpload,
  subcategoryImageUpload,
  riderImageUpload,
  cmsImageUpload,
  singleImageUpload,
  multipleImageUpload,
  uploadFilesToR2,
  r2Service
};