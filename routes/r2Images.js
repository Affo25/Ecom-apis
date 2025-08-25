/**
 * R2 Images Routes
 * Routes for managing Cloudflare R2 image operations
 */

const express = require('express');
const router = express.Router();
const R2ImageService = require('../services/R2ImageService');
const { singleImageUpload, multipleImageUpload } = require('../middleware/r2Upload');

// Initialize R2 service
const r2Service = new R2ImageService();

/**
 * Upload single image to R2
 * POST /api/r2-images/upload
 */
router.post('/upload', singleImageUpload, async (req, res) => {
  try {
    console.log('📤 Single image upload to R2');
    
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const { category = 'general', subCategory = '' } = req.body;
    const file = req.files.image[0];
    
    const result = await r2Service.uploadSingleImage(file, category, subCategory);
    
    console.log('✅ Image uploaded to R2:', result.url);
    
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ R2 upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Upload failed'
    });
  }
});

/**
 * Upload multiple images to R2
 * POST /api/r2-images/upload-multiple
 */
router.post('/upload-multiple', multipleImageUpload, async (req, res) => {
  try {
    console.log('📤 Multiple images upload to R2');
    
    if (!req.files || !req.files.images || req.files.images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided'
      });
    }

    const { category = 'general', subCategory = '' } = req.body;
    const files = req.files.images;
    
    const results = await r2Service.uploadMultipleImages(files, category, subCategory);
    
    console.log(`✅ ${results.length} images uploaded to R2`);
    
    res.json({
      success: true,
      message: `${results.length} images uploaded successfully`,
      data: results
    });
  } catch (error) {
    console.error('❌ R2 multiple upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload images',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Upload failed'
    });
  }
});

/**
 * Delete image from R2
 * DELETE /api/r2-images/:imageUrl
 */
router.delete('/delete', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    console.log('🗑️ Deleting image from R2:', imageUrl);
    
    await r2Service.deleteImage(imageUrl);
    
    console.log('✅ Image deleted from R2');
    
    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: { deletedUrl: imageUrl }
    });
  } catch (error) {
    console.error('❌ R2 delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Delete failed'
    });
  }
});

/**
 * Get R2 service status
 * GET /api/r2-images/status
 */
router.get('/status', async (req, res) => {
  try {
    // Test R2 connection
    const status = await r2Service.testConnection();
    
    res.json({
      success: true,
      message: 'R2 service status retrieved',
      data: {
        r2Connected: status,
        timestamp: new Date().toISOString(),
        bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'Not configured',
        domain: process.env.CLOUDFLARE_R2_DOMAIN || 'Not configured'
      }
    });
  } catch (error) {
    console.error('❌ R2 status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check R2 status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Status check failed'
    });
  }
});

/**
 * Health check endpoint
 * GET /api/r2-images/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'R2 Images API is healthy',
    data: {
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  });
});

module.exports = router;