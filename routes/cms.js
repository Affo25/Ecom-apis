const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { verifyToken: auth } = require('../middleware/auth');
const  {CMS}  = require('../models/Cms');

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

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const bannerDir = path.join(__dirname, '../uploads/banner');
  const logoDir = path.join(__dirname, '../uploads/logo');

  [bannerDir, logoDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureUploadDirs();

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const fieldName = file.fieldname;
      let uploadPath;
      
      if (fieldName === 'banner' || fieldName === 'banners') {
        uploadPath = path.join(__dirname, '../uploads/banner');
      } else if (fieldName === 'logo') {
        uploadPath = path.join(__dirname, '../uploads/logo');
      } else {
        uploadPath = path.join(__dirname, '../uploads');
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const ext = path.extname(file.originalname);
      const name = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '-');
      cb(null, `${timestamp}-${random}-${name}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'), false);
    }
  }
});

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

// ✅ SAVE CMS with Banner and Logo Images
router.post('/save', auth, upload.fields([
  { name: 'banner', maxCount: 5 },
  { name: 'logo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { themeName, ...cmsData } = req.body;
    const theme = themeName || 'theme2';
    const baseUrl = process.env.BASE_URL || 'http://localhost:5009';

    // Handle uploaded files
    const uploadedFiles = {
      banners: [],
      logo: null
    };

    if (req.files) {
      // Handle banner uploads
      if (req.files.banner) {
        uploadedFiles.banners = req.files.banner.map((file, index) => ({
          id: `banner-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          url: `${baseUrl}/uploads/banner/${file.filename}`,
          alt: file.originalname.replace(/\.[^/.]+$/, ""), // Remove file extension
          title: file.originalname.replace(/\.[^/.]+$/, ""),
          filename: file.filename,
          originalName: file.originalname,
          order: index
        }));
      }

      // Handle logo upload
      if (req.files.logo && req.files.logo[0]) {
        const logoFile = req.files.logo[0];
        uploadedFiles.logo = {
          url: `${baseUrl}/uploads/logo/${logoFile.filename}`,
          filename: logoFile.filename,
          originalName: logoFile.originalname
        };
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

// ✅ UPLOAD BANNER Image (Individual Upload)
router.post('/upload/banner', auth, upload.single('banner'), async (req, res) => {
  try {
    console.log('🎨 Banner upload request received');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No banner file provided'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
    const fileUrl = `${baseUrl}/uploads/banner/${req.file.filename}`;

    console.log('✅ Banner uploaded successfully:', fileUrl);

    res.json({
      success: true,
      message: 'Banner uploaded successfully',
      data: {
        id: `banner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: fileUrl,
        alt: req.file.originalname.replace(/\.[^/.]+$/, ""), // Remove file extension
        title: req.file.originalname.replace(/\.[^/.]+$/, ""),
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        type: 'banner',
        order: 0
      }
    });

  } catch (error) {
    console.error('❌ Error uploading banner:', error);
    
    if (error.message === 'Only image files allowed') {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for banner'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload banner',
      error: error.message
    });
  }
});

// ✅ UPLOAD LOGO Image (Individual Upload)
router.post('/upload/logo', auth, upload.single('logo'), async (req, res) => {
  try {
    console.log('🏢 Logo upload request received');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
    const fileUrl = `${baseUrl}/uploads/logo/${req.file.filename}`;

    console.log('✅ Logo uploaded successfully:', fileUrl);

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        type: 'logo'
      }
    });

  } catch (error) {
    console.error('❌ Error uploading logo:', error);
    
    if (error.message === 'Only image files allowed') {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for logo'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload logo',
      error: error.message
    });
  }
});

// ✅ UPLOAD Multiple BANNER Images (Individual Upload)
router.post('/upload/banners', auth, upload.array('files', 5), async (req, res) => {
  try {
    console.log('🎨 Multiple banners upload request received');

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No banner files provided'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
    const uploadedFiles = req.files.map((file, index) => ({
      id: `banner-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      url: `${baseUrl}/uploads/banner/${file.filename}`,
      alt: file.originalname.replace(/\.[^/.]+$/, ""), // Remove file extension
      title: file.originalname.replace(/\.[^/.]+$/, ""),
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      order: index
    }));

    console.log(`✅ ${uploadedFiles.length} banners uploaded successfully`);

    res.json({
      success: true,
      message: `${uploadedFiles.length} banners uploaded successfully`,
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length,
        type: 'banners'
      }
    });

  } catch (error) {
    console.error('❌ Error uploading banners:', error);
    
    if (error.message === 'Only image files allowed') {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for banners'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload banners',
      error: error.message
    });
  }
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