const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

// Import local image handling configuration

const R2ImageService = require('../services/R2ImageService');
const { riderImageUpload } = require('../middleware/r2Upload');

// Import Rider model
const Rider = require('../models/Rider');

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

// Debug endpoint to test database connection and riders
router.get('/debug', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const riderCount = await countDocuments(Rider);
    const availableRiderCount = await countDocuments(Rider, { isAvailable: true });
    
    res.json({
      success: true,
      message: 'Debug info',
      data: {
        database: dbStatus,
        environment: process.env.NODE_ENV || 'development',
        totalRiders: riderCount,
        availableRiders: availableRiderCount,
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
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 4 // Maximum 4 files (image, cnicFront, cnicBack, bikeDocument)
  },
  fileFilter: function (req, file, cb) {
    console.log('📎 File upload attempt:', file.fieldname, file.mimetype);
    
    // Accept images for profile, CNIC front, and CNIC back
    if (file.fieldname === 'image' || file.fieldname === 'cnicFrontImage' || file.fieldname === 'cnicBackImage') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error(`Only image files are allowed for ${file.fieldname}!`), false);
      }
    }
    // Accept PDF files for bike document
    else if (file.fieldname === 'bikeDocument') {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed for bike document!'), false);
      }
    } else {
      cb(new Error('Unknown file field!'), false);
    }
  }
});

// Configure upload fields
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'cnicFrontImage', maxCount: 1 },
  { name: 'cnicBackImage', maxCount: 1 },
  { name: 'bikeDocument', maxCount: 1 }
]);

// Get all riders with filtering, sorting and pagination
router.get('/', async (req, res) => {
  try {
    console.log('🚴 Fetching riders - DB state:', mongoose.connection.readyState);

    const {
      page = 1,
      limit = 12,
      sort = 'createdAt',
      order = 'desc',
      fullName,
      phone,
      email,
      address,
      vehicleType,
      isAvailable,
      location
    } = req.query;

    // Build filter object
    const filter = {};

    // Apply filters
    if (fullName) {
      filter.fullName = { $regex: fullName, $options: 'i' };
    }

    if (phone) {
      filter.phone = { $regex: phone, $options: 'i' };
    }

    if (email) {
      filter.email = { $regex: email, $options: 'i' };
    }

    if (address) {
      filter.address = { $regex: address, $options: 'i' };
    }

    if (vehicleType && vehicleType !== 'all') {
      filter.vehicleType = vehicleType;
    }

    if (isAvailable !== undefined && isAvailable !== '') {
      filter.isAvailable = isAvailable === 'true';
    }

    // Build sort object
    let sortObj = {};
    const sortDirection = order === 'asc' ? 1 : -1;
    
    switch (sort) {
      case 'fullName':
        sortObj = { fullName: sortDirection };
        break;
      case 'phone':
        sortObj = { phone: sortDirection };
        break;
      case 'address':
        sortObj = { address: sortDirection };
        break;
      case 'vehicleType':
        sortObj = { vehicleType: sortDirection };
        break;
      case 'isAvailable':
        sortObj = { isAvailable: sortDirection };
        break;
      case 'createdAt':
      default:
        sortObj = { createdAt: sortDirection };
        break;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query using generic service
    const riders = await findAll(Rider, filter, {
      sort: sortObj,
      skip: skip,
      limit: parseInt(limit),
      lean: true
    });

    // Get total count for pagination
    const total = await countDocuments(Rider, filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Riders fetched successfully',
      data: {
        riders,
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
    console.error('Error fetching riders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch riders',
      error: error.message
    });
  }
});

// Get single rider
router.get('/:id', async (req, res) => {
  try {
    const rider = await findById(Rider, req.params.id);
    
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    res.json({
      success: true,
      message: 'Rider fetched successfully',
      data: rider
    });
  } catch (error) {
    console.error('Error fetching rider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rider',
      error: error.message
    });
  }
});

// Create new rider with R2 image upload
router.post('/', riderImageUpload, async (req, res) => {
  try {
    console.log('🆕 Creating new rider with R2');
    console.log('📦 Request body:', req.body);
    console.log('📸 Files:', req.files ? Object.keys(req.files) : 'No files');

    const riderData = req.body;
    
    // Handle multiple file uploads to R2
    const uploadedUrls = {
      image: '',
      cnicFrontImage: '',
      cnicBackImage: '',
      bikeDocument: ''
    };

    // Upload images to R2 using simplified approach
    if (req.files && Object.keys(req.files).length > 0) {
      console.log('📤 Uploading rider images to R2...');
      try {
        const r2Service = req.r2Service;
        
        // Convert req.files format for R2 service
        const imageFiles = {};
        for (const fieldName in req.files) {
          if (req.files[fieldName] && req.files[fieldName][0]) {
            imageFiles[fieldName] = req.files[fieldName][0];
          }
        }
        
        // Create a temporary rider to get an ID for folder organization
        const tempRider = new Rider({
          fullName: riderData.fullName || 'Temp',
          phone: riderData.phone || '0000000000',
          address: riderData.address || 'Temp Address'
        });
        const savedTempRider = await tempRider.save();
        const riderId = savedTempRider._id.toString();
        
        // Upload all files and update URLs
        for (const [fieldName, file] of Object.entries(imageFiles)) {
          const result = await r2Service.uploadSingleImage(file, 'riders', `${riderId}_${fieldName}`);
          uploadedUrls[fieldName] = result.url;
          console.log(`✅ R2 ${fieldName} uploaded: ${result.url}`);
        }
        
        // Delete temp rider and create real one with proper data
        await Rider.findByIdAndDelete(riderId);
        
      } catch (uploadError) {
        console.error('❌ R2 upload error:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload rider images to R2',
          error: uploadError.message
        });
      }
    }

    // Prepare comprehensive rider data
    const newRiderData = {
      fullName: riderData.fullName || '',
      phone: riderData.phone || '',
      email: riderData.email || '',
      address: riderData.address || '',
      vehicleType: riderData.vehicleType || 'bike',
      licenseNumber: riderData.licenseNumber || '',
      image: uploadedUrls.image,
      cnicFrontImage: uploadedUrls.cnicFrontImage,
      cnicBackImage: uploadedUrls.cnicBackImage,
      bikeDocument: uploadedUrls.bikeDocument,
      isAvailable: riderData.isAvailable !== undefined ? Boolean(riderData.isAvailable) : true,
    };

    // Handle location if provided
    if (riderData.longitude && riderData.latitude) {
      newRiderData.location = {
        type: 'Point',
        coordinates: [parseFloat(riderData.longitude), parseFloat(riderData.latitude)]
      };
    }

    console.log('💾 Final rider data:', newRiderData);

    // Create rider
    const rider = new Rider(newRiderData);
    await rider.save();

    console.log('✅ Rider created successfully');

    res.status(201).json({
      success: true,
      message: 'Rider created successfully',
      data: rider
    });
  } catch (error) {
    console.error('❌ Error creating rider:', error);
    
    // Handle specific mongoose errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Rider with this ${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create rider',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update rider with R2 image upload
router.put('/:id', riderImageUpload, async (req, res) => {
  try {
    console.log('🔄 Updating rider with ID:', req.params.id);
    console.log('📦 Request body:', req.body);
    console.log('📸 Files:', req.files ? Object.keys(req.files) : 'No files');

    const riderData = req.body;
    const existingRider = await findById(Rider, req.params.id);
    
    if (!existingRider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Prepare update data
    const updateData = {};

    // Basic rider information
    if (riderData.fullName !== undefined) updateData.fullName = riderData.fullName;
    if (riderData.phone !== undefined) updateData.phone = riderData.phone;
    if (riderData.email !== undefined) updateData.email = riderData.email;
    if (riderData.address !== undefined) updateData.address = riderData.address;
    if (riderData.vehicleType !== undefined) updateData.vehicleType = riderData.vehicleType;
    if (riderData.licenseNumber !== undefined) updateData.licenseNumber = riderData.licenseNumber;
    if (riderData.isAvailable !== undefined) updateData.isAvailable = Boolean(riderData.isAvailable);

    // Handle location update
    if (riderData.longitude && riderData.latitude) {
      updateData.location = {
        type: 'Point',
        coordinates: [parseFloat(riderData.longitude), parseFloat(riderData.latitude)]
      };
    }

    // Handle multiple file updates with R2
    if (req.files && Object.keys(req.files).length > 0) {
      console.log('📤 Updating rider files with R2...');
      try {
        const r2Service = req.r2Service;
        const riderId = existingRider._id.toString();
        
        // Handle profile image update
        if (req.files.image && req.files.image[0]) {
          // Delete old image from R2 if exists
          if (existingRider.image) {
            try {
              await r2Service.deleteImage(existingRider.image);
              console.log('🗑️ Old profile image deleted from R2');
            } catch (deleteError) {
              console.error('❌ Error deleting old profile image from R2:', deleteError);
            }
          }
          
          const result = await r2Service.uploadSingleImage(req.files.image[0], 'riders', `${riderId}_image`);
          updateData.image = result.url;
          console.log(`✅ New profile image uploaded to R2: ${result.url}`);
        }

        // Handle CNIC front image update
        if (req.files.cnicFrontImage && req.files.cnicFrontImage[0]) {
          // Delete old CNIC front image from R2 if exists
          if (existingRider.cnicFrontImage) {
            try {
              await r2Service.deleteImage(existingRider.cnicFrontImage);
              console.log('🗑️ Old CNIC front image deleted from R2');
            } catch (deleteError) {
              console.error('❌ Error deleting old CNIC front image from R2:', deleteError);
            }
          }
          
          const result = await r2Service.uploadSingleImage(req.files.cnicFrontImage[0], 'riders', `${riderId}_cnicFront`);
          updateData.cnicFrontImage = result.url;
          console.log(`✅ New CNIC front image uploaded to R2: ${result.url}`);
        }

        // Handle CNIC back image update
        if (req.files.cnicBackImage && req.files.cnicBackImage[0]) {
          // Delete old CNIC back image from R2 if exists
          if (existingRider.cnicBackImage) {
            try {
              await r2Service.deleteImage(existingRider.cnicBackImage);
              console.log('🗑️ Old CNIC back image deleted from R2');
            } catch (deleteError) {
              console.error('❌ Error deleting old CNIC back image from R2:', deleteError);
            }
          }
          
          const result = await r2Service.uploadSingleImage(req.files.cnicBackImage[0], 'riders', `${riderId}_cnicBack`);
          updateData.cnicBackImage = result.url;
          console.log(`✅ New CNIC back image uploaded to R2: ${result.url}`);
        }

        // Handle bike document update
        if (req.files.bikeDocument && req.files.bikeDocument[0]) {
          // Delete old bike document from R2 if exists
          if (existingRider.bikeDocument) {
            try {
              await r2Service.deleteImage(existingRider.bikeDocument);
              console.log('🗑️ Old bike document deleted from R2');
            } catch (deleteError) {
              console.error('❌ Error deleting old bike document from R2:', deleteError);
            }
          }
          
          const result = await r2Service.uploadSingleImage(req.files.bikeDocument[0], 'riders', `${riderId}_bikeDoc`);
          updateData.bikeDocument = result.url;
          console.log(`✅ New bike document uploaded to R2: ${result.url}`);
        }
        
      } catch (uploadError) {
        console.error('❌ R2 file update error:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Failed to update rider files with R2',
          error: uploadError.message
        });
      }
    }

    console.log('💾 Update data:', updateData);

    // Update rider using generic service
    const updatedRider = await updateById(Rider,
      req.params.id,
      updateData,
      { runValidators: true }
    );

    console.log('✅ Rider updated successfully');

    res.json({
      success: true,
      message: 'Rider updated successfully',
      data: updatedRider
    });
  } catch (error) {
    console.error('❌ Error updating rider:', error);
    
    // Handle specific mongoose errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Rider with this ${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update rider',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete rider
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting rider with ID:', req.params.id);

    const rider = await findById(Rider, req.params.id);
    
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Check if rider has assigned orders
    if (rider.assignedOrders && rider.assignedOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete rider with assigned orders. Please reassign orders first.'
      });
    }

    // Delete all rider files if they exist
    const filesToDelete = [
      { url: rider.image, type: 'profile image' },
      { url: rider.cnicFrontImage, type: 'CNIC front image' },
      { url: rider.cnicBackImage, type: 'CNIC back image' },
      { url: rider.bikeDocument, type: 'bike document' }
    ];

    for (const file of filesToDelete) {
      if (file.url) {
        try {
          const filename = file.url.split('/').pop();
          await deleteImage(filename);
          console.log(`Deleted rider ${file.type}: ${filename}`);
        } catch (deleteError) {
          console.error(`Error deleting rider ${file.type}:`, deleteError);
          // Continue with rider deletion even if file deletion fails
        }
      }
    }

    // Delete rider using generic service
    await deleteById(Rider, req.params.id);

    console.log('✅ Rider deleted successfully');

    res.json({
      success: true,
      message: 'Rider deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting rider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete rider',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Toggle rider availability
router.patch('/:id/availability', async (req, res) => {
  try {
    console.log('🔄 Toggling availability for rider:', req.params.id);

    const rider = await findById(Rider, req.params.id);
    
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }

    // Toggle availability
    rider.isAvailable = !rider.isAvailable;
    await rider.save();

    console.log(`✅ Rider availability updated to: ${rider.isAvailable}`);

    res.json({
      success: true,
      message: `Rider ${rider.isAvailable ? 'made available' : 'made unavailable'} successfully`,
      data: {
        id: rider._id,
        isAvailable: rider.isAvailable
      }
    });
  } catch (error) {
    console.error('❌ Error toggling rider availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rider availability',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get available riders near location (for order assignment)
router.get('/available/nearby', async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 10000 } = req.query; // maxDistance in meters

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }

    const nearbyRiders = await findAll(Rider, {
      isAvailable: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).limit(10);

    res.json({
      success: true,
      message: 'Nearby available riders fetched successfully',
      data: nearbyRiders
    });
  } catch (error) {
    console.error('Error fetching nearby riders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby riders',
      error: error.message
    });
  }
});

module.exports = router;