// LOCAL STORAGE ONLY - Image upload configuration (NO CLOUDINARY)
// This file handles image uploads to local file system only
// Featured images are saved to: server/uploads/featuredimage/
// URL format: http://localhost:5009/upload/featuredimage/filename

const fs = require('fs');
const path = require('path');

// Create upload directories if they don't exist
const createUploadDirectories = () => {
  const uploadDir = path.join(__dirname, '../uploads');
  const featuredImagesDir = path.join(uploadDir, 'featuredimage'); // Changed to 'featuredimage' (singular)
  const productsDir = path.join(uploadDir, 'products');
  const pagesDir = path.join(uploadDir, 'pages');
  const contactDir = path.join(uploadDir, 'contact'); // Contact page images directory

  // Create directories if they don't exist
  [uploadDir, featuredImagesDir, productsDir, pagesDir, contactDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
};

// Initialize directories on module load
createUploadDirectories();

// Upload image to local storage ONLY (no Cloudinary)
const uploadImage = async (file, category = 'general') => {
  try {
    console.log(`🔄 Starting local file upload for category: ${category}`);
    console.log(`📁 File info:`, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      hasBuffer: !!file.buffer
    });
    
    // Validate file object
    if (!file || !file.buffer) {
      throw new Error('Invalid file object - missing buffer');
    }
    
    // For pages (featured images), save to uploads/featuredimage folder
    // For products, save to products subfolder
    // For contact pages, save to contact subfolder
    let uploadDir;
    let urlPath;
    
    if (category === 'pages') {
      // Save featured images to uploads/featuredimage folder
      uploadDir = path.join(__dirname, '../uploads', 'featuredimage');
      urlPath = '/upload/featuredimage'; // Note: 'upload' (singular) as requested
    } else if (category === 'products') {
      uploadDir = path.join(__dirname, '../uploads', 'products');
      urlPath = '/upload/products'; // Keep consistent with 'upload' (singular)
    } else if (category === 'contact') {
      // Save contact page images to uploads/contact folder
      uploadDir = path.join(__dirname, '../uploads', 'contact');
      urlPath = '/upload/contact'; // Contact page images
    } else {
      uploadDir = path.join(__dirname, '../uploads');
      urlPath = '/upload';
    }
    
    console.log(`📂 Upload directory: ${uploadDir}`);
    console.log(`🔗 URL path: ${urlPath}`);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      console.log(`📁 Creating directory: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000000);
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${timestamp}-${randomNum}${extension}`;
    const filePath = path.join(uploadDir, filename);

    console.log(`💾 Saving file to: ${filePath}`);
    
    // Write file to local storage
    fs.writeFileSync(filePath, file.buffer);
    
    // Verify file was written
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✅ File saved successfully. Size: ${stats.size} bytes`);
    } else {
      throw new Error('File was not saved properly');
    }

    // Create full URL (we'll get the base URL from environment or request)
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:5009';
    const fullUrl = `${baseUrl}${urlPath}/${filename}`;
    
    console.log(`🔗 Full URL: ${fullUrl}`);
    console.log(`✅ LOCAL STORAGE UPLOAD COMPLETED SUCCESSFULLY`);
    
    return {
      url: fullUrl,
      filename: filename,
      path: filePath,
      relativePath: `${urlPath}/${filename}`,
      size: file.size,
      mimetype: file.mimetype
    };
  } catch (error) {
    console.error('❌ LOCAL STORAGE UPLOAD ERROR:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      file: file ? {
        originalname: file.originalname,
        size: file.size,
        hasBuffer: !!file.buffer
      } : 'No file object'
    });
    throw new Error(`LOCAL STORAGE UPLOAD FAILED: ${error.message}`);
  }
};

// Delete image from local storage ONLY (no Cloudinary)
const deleteImage = async (filename, category = 'general') => {
  try {
    console.log(`🗑️ Starting LOCAL STORAGE deletion for: ${filename} (category: ${category})`);
    
    // Determine the directory based on category
    let filePath;
    
    if (category === 'pages') {
      // Featured images are saved in uploads/featuredimage folder
      filePath = path.join(__dirname, '../uploads', 'featuredimage', filename);
    } else if (category === 'products') {
      filePath = path.join(__dirname, '../uploads', 'products', filename);
    } else if (category === 'contact') {
      // Contact page images are saved in uploads/contact folder
      filePath = path.join(__dirname, '../uploads', 'contact', filename);
    } else {
      filePath = path.join(__dirname, '../uploads', filename);
    }

    console.log(`📂 Deletion path: ${filePath}`);

    // Check if file exists and delete it
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`📁 File found. Size: ${stats.size} bytes`);
      
      fs.unlinkSync(filePath);
      
      // Verify deletion
      if (!fs.existsSync(filePath)) {
        console.log(`✅ Image deleted successfully from LOCAL STORAGE: ${filename}`);
        return true;
      } else {
        console.log(`❌ File still exists after deletion attempt: ${filename}`);
        return false;
      }
    } else {
      console.log(`⚠️ Image not found in LOCAL STORAGE for deletion: ${filename}`);
      console.log(`📂 Searched in: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error('❌ LOCAL STORAGE DELETION ERROR:', error);
    console.error('❌ Error details:', {
      filename,
      category,
      message: error.message,
      stack: error.stack
    });
    throw new Error(`LOCAL STORAGE DELETE FAILED: ${error.message}`);
  }
};

// Get image URL (for local storage, this returns the full URL)
const getImageUrl = (filename, category = 'general') => {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:5009';
  
  if (category === 'pages') {
    // Featured images are in uploads/featuredimage folder
    return `${baseUrl}/upload/featuredimage/${filename}`;
  } else if (category === 'products') {
    return `${baseUrl}/upload/products/${filename}`;
  } else if (category === 'contact') {
    // Contact page images are in uploads/contact folder
    return `${baseUrl}/upload/contact/${filename}`;
  } else {
    return `${baseUrl}/upload/${filename}`;
  }
};

module.exports = {
  uploadImage,
  deleteImage,
  getImageUrl
};
