const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { productImageUpload } = require('../middleware/r2Upload');

// Test R2 upload endpoint
router.post('/upload', verifyToken, productImageUpload, async (req, res) => {
  try {
    console.log('🧪 Testing R2 upload...');
    console.log('📸 Files:', req.files ? Object.keys(req.files) : 'No files');

    if (!req.files || !req.files.images || req.files.images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided for testing'
      });
    }

    // Upload images to R2
    const r2Service = req.r2Service;
    const uploadResults = await r2Service.uploadMultipleImages(req.files.images, 'test');
    const imageUrls = uploadResults.map(result => result.url);

    console.log('✅ R2 Test Upload Completed');
    console.log('📍 Generated URLs:', imageUrls);

    res.json({
      success: true,
      message: 'R2 upload test completed',
      uploadedImages: uploadResults,
      urls: imageUrls,
      count: imageUrls.length
    });

  } catch (error) {
    console.error('❌ R2 Test Upload Error:', error);
    res.status(500).json({
      success: false,
      message: 'R2 upload test failed',
      error: error.message
    });
  }
});

// Test R2 configuration endpoint
router.get('/config', verifyToken, async (req, res) => {
  try {
    const R2ImageService = require('../services/R2ImageService');
    const r2Service = new R2ImageService();
    
    res.json({
      success: true,
      message: 'R2 configuration check',
      config: {
        bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        domain: process.env.CLOUDFLARE_R2_DOMAIN,
        baseUrl: `https://${process.env.CLOUDFLARE_R2_BUCKET_NAME}.${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        hasAccessKey: !!process.env.CLOUDFLARE_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.CLOUDFLARE_SECRET_ACCESS_KEY
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'R2 config check failed',
      error: error.message
    });
  }
});

module.exports = router;