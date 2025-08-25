const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { verifyToken: auth } = require('../middleware/auth');
const  {CMS}  = require('../models/Cms');
const R2ImageService = require('../services/R2ImageService');
const { cmsImageUpload } = require('../middleware/r2Upload');

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





// ✅ GET CMS Data by Theme Name
router.get('/:themeName?', async (req, res) => {
  try {
    const themeName = req.params.themeName || 'theme2';
    console.log(`🔍 Getting CMS data for theme: ${themeName}`);
    
    const cmsData = await CMS.findOne({ 
      theme_name: themeName, 
    });

    console.log(`✅ Retrieved CMS data for theme '${themeName}'`);

    // Ensure proper data structure if no data found or incomplete data
    if (!cmsData) {
      console.log(`❌ No CMS data found for theme: ${themeName}`);
      return res.json({
        success: false,
        message: 'No CMS data found for theme',
        data: null
      });
    }

    // Ensure menus object exists with proper structure
    if (!cmsData.menus) {
      cmsData.menus = {
        headerMenu: [],
        footerMenu: []
      };
    }

    res.json({
      success: true,
      data: cmsData
    });

  } catch (error) {
    console.error('❌ Error getting CMS data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get CMS data',
      error: error.message
    });
  }
});

// ✅ SAVE CMS with Banner and Logo Images using R2
router.post('/save', auth, cmsImageUpload, async (req, res) => {
  try {
    const { themeName, ...cmsData } = req.body;
    const theme = themeName || 'theme2';

    // Handle uploaded files with R2
    const uploadedFiles = {
      banners: [],
      logo: null
    };

    if (req.files) {
      console.log('📤 Uploading CMS images to R2...');
      try {
        const r2Service = req.r2Service;
        
        // Handle banner uploads to R2
        if (req.files.bannerImages) {
          const bannerUploadResults = await r2Service.uploadMultipleImages(
            req.files.bannerImages, 
            'cms', 
            'banners'
          );
          
          uploadedFiles.banners = bannerUploadResults.map((result, index) => ({
            id: `banner-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            url: result.url,
            alt: result.originalName.replace(/\.[^/.]+$/, ""), // Remove file extension
            title: result.originalName.replace(/\.[^/.]+$/, ""),
            originalName: result.originalName,
            order: index
          }));
          
          console.log(`✅ R2 banner images uploaded: ${bannerUploadResults.length} files`);
        }

        // Handle logo upload to R2
        if (req.files.logoImage && req.files.logoImage[0]) {
          const logoUploadResult = await r2Service.uploadSingleImage(
            req.files.logoImage[0], 
            'cms', 
            'logo'
          );
          
          uploadedFiles.logo = {
            url: logoUploadResult.url,
            originalName: logoUploadResult.originalName
          };
          
          console.log(`✅ R2 logo uploaded: ${logoUploadResult.url}`);
        }

        // Handle favicon upload to R2
        if (req.files.faviconImage && req.files.faviconImage[0]) {
          const faviconUploadResult = await r2Service.uploadSingleImage(
            req.files.faviconImage[0], 
            'cms', 
            'favicon'
          );
          
          if (!uploadedFiles.logo) uploadedFiles.logo = {};
          uploadedFiles.logo.faviconUrl = faviconUploadResult.url;
          
          console.log(`✅ R2 favicon uploaded: ${faviconUploadResult.url}`);
        }
        
      } catch (uploadError) {
        console.error('❌ R2 CMS upload error:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload CMS images to R2',
          error: uploadError.message
        });
      }
    }

    // Parse JSON strings from form data
    let parsedData = {};
    Object.keys(cmsData).forEach(key => {
      try {
        parsedData[key] = typeof cmsData[key] === 'string' ? JSON.parse(cmsData[key]) : cmsData[key];
      } catch {
        parsedData[key] = cmsData[key];
      }
    });

    // Merge uploaded files with CMS data
    if (uploadedFiles.banners.length > 0) {
      // Use banner.images structure to match admin page
      if (!parsedData.banner) {
        parsedData.banner = {};
      }
      parsedData.banner.images = [...(parsedData.banner?.images || []), ...uploadedFiles.banners];
    }
    if (uploadedFiles.logo) {
      parsedData.logo = uploadedFiles.logo;
    }

    // Save to database
    let savedCMS = await updateOne(CMS,
      { theme_name: theme, isActive: true },
      { 
        ...parsedData,
        theme_name: theme,
        isActive: true,
        updated_at: new Date()
      },
      { 
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    res.json({
      success: true,
      message: 'CMS data saved successfully',
      data: savedCMS.toObject(),
      uploadedFiles
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to save CMS data',
      error: error.message
    });
  }
});

// ✅ GET CMS Configuration for Admin (same as GET /:themeName but with auth)
router.get('/update/:themeName?', auth, async (req, res) => {
  try {
    const themeName = req.params.themeName || 'theme2';
    console.log(`🔍 Getting CMS config for admin: ${themeName}`);

    const cmsData = await findOne(CMS, { 
      theme_name: themeName, 
      isActive: true 
    });

    if (cmsData) {
      console.log('✅ CMS configuration found');
      res.json({
        success: true,
        message: 'CMS configuration retrieved successfully',
        data: cmsData.toObject()
      });
    } else {
      console.log('📝 No CMS configuration found');
      res.json({
        success: true,
        message: 'No CMS configuration found',
        data: null
      });
    }

  } catch (error) {
    console.error('❌ Error getting CMS config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get CMS configuration',
      error: error.message
    });
  }
});

// ✅ UPDATE CMS Record
router.put('/update/:themeName?', auth, async (req, res) => {
  try {
    const themeName = req.params.themeName || 'theme2';
    const updateData = req.body;

    const updatedCMS = await updateOne(CMS,
      { theme_name: themeName, isActive: true },
      { 
        ...updateData, 
        updated_at: new Date() 
      },
      { 
        upsert: true 
      }
    );

    res.json({
      success: true,
      message: 'CMS data updated successfully',
      data: updatedCMS.toObject()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update CMS data',
      error: error.message
    });
  }
});

// ✅ UPLOAD BANNER Image (Individual Upload) - R2 Version
router.post('/upload/banner', auth, async (req, res) => {
  const r2Service = new R2ImageService();
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files allowed'), false);
      }
    }
  });

  upload.single('banner')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message
      });
    }

    try {
      console.log('🎨 Banner upload request received for R2');

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No banner file provided'
        });
      }

      // Upload to R2
      const uploadResult = await r2Service.uploadSingleImage(
        req.file,
        'cms',
        `banner_${Date.now()}`
      );

      console.log('✅ Banner uploaded to R2 successfully:', uploadResult.url);

      res.json({
        success: true,
        message: 'Banner uploaded successfully to R2',
        data: {
          id: `banner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: uploadResult.url,
          alt: req.file.originalname.replace(/\.[^/.]+$/, ""), // Remove file extension
          title: req.file.originalname.replace(/\.[^/.]+$/, ""),
          originalName: uploadResult.originalName,
          size: req.file.size,
          mimetype: req.file.mimetype,
          type: 'banner',
          order: 0
        }
      });

    } catch (error) {
      console.error('❌ Error uploading banner to R2:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to upload banner to R2',
        error: error.message
      });
    }
  });
});

// ✅ UPLOAD LOGO Image (Individual Upload) - R2 Version
router.post('/upload/logo', auth, async (req, res) => {
  const r2Service = new R2ImageService();
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files allowed'), false);
      }
    }
  });

  upload.single('logo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message
      });
    }

    try {
      console.log('🏢 Logo upload request received for R2');

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No logo file provided'
        });
      }

      // Upload to R2
      const uploadResult = await r2Service.uploadSingleImage(
        req.file,
        'cms',
        `logo_${Date.now()}`
      );

      console.log('✅ Logo uploaded to R2 successfully:', uploadResult.url);

      res.json({
        success: true,
        message: 'Logo uploaded successfully to R2',
        data: {
          url: uploadResult.url,
          originalName: uploadResult.originalName,
          size: req.file.size,
          mimetype: req.file.mimetype,
          type: 'logo'
        }
      });

    } catch (error) {
      console.error('❌ Error uploading logo to R2:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to upload logo to R2',
        error: error.message
      });
    }
  });
});

// ✅ UPLOAD Multiple BANNER Images (Individual Upload) - R2 Version
router.post('/upload/banners', auth, async (req, res) => {
  const r2Service = new R2ImageService();
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files allowed'), false);
      }
    }
  });

  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message
      });
    }

    try {
      console.log('🎨 Multiple banners upload request received for R2');

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No banner files provided'
        });
      }

      // Upload all files to R2
      const uploadResults = await r2Service.uploadMultipleImages(
        req.files,
        'cms',
        'banners'
      );

      const uploadedFiles = uploadResults.map((result, index) => ({
        id: `banner-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        url: result.url,
        alt: result.originalName.replace(/\.[^/.]+$/, ""), // Remove file extension
        title: result.originalName.replace(/\.[^/.]+$/, ""),
        originalName: result.originalName,
        size: req.files[index].size,
        mimetype: req.files[index].mimetype,
        order: index
      }));

      console.log(`✅ ${uploadedFiles.length} banners uploaded to R2 successfully`);

      res.json({
        success: true,
        message: `${uploadedFiles.length} banners uploaded successfully to R2`,
        data: {
          files: uploadedFiles,
          count: uploadedFiles.length,
          type: 'banners'
        }
      });

    } catch (error) {
      console.error('❌ Error uploading banners to R2:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to upload banners to R2',
        error: error.message
      });
    }
  });
});

// ✅ RESET CMS Configuration
router.post('/reset', auth, async (req, res) => {
  try {
    console.log('🔄 Resetting CMS configuration to default');

    // Deactivate all existing CMS configurations
    await updateMany(CMS,
      {},
      { isActive: false, updated_at: new Date() }
    );

    console.log('✅ All CMS configurations deactivated');

    res.json({
      success: true,
      message: 'CMS configuration reset successfully. Static config will be used.',
      data: null
    });

  } catch (error) {
    console.error('❌ Error resetting CMS config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset CMS configuration',
      error: error.message
    });
  }
});

module.exports = router;