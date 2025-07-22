const fs = require('fs');
const path = require('path');

// Simple image handling without Cloudinary
const uploadDir = path.join(__dirname, '../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Save image locally (for development/testing)
const saveImageLocally = async (file, folder = 'products') => {
  try {
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    
    // Save file to local uploads directory
    fs.writeFileSync(filePath, file.buffer);
    
    // Return a mock URL structure similar to Cloudinary
    const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
    
    return {
      url: `${baseUrl}/uploads/${fileName}`,
      public_id: fileName,
      width: 800,
      height: 600,
      format: path.extname(file.originalname).substring(1)
    };
  } catch (error) {
    console.error('Local image save error:', error);
    throw error;
  }
};

// Delete image from local storage
const deleteLocalImage = async (public_id) => {
  try {
    const filePath = path.join(uploadDir, public_id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { result: 'ok' };
    }
    return { result: 'not found' };
  } catch (error) {
    console.error('Local image delete error:', error);
    throw error;
  }
};

// Get image URL (simple passthrough for local images)
const getImageUrl = (public_id, width = 400, height = 400) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
  return `${baseUrl}/uploads/${public_id}`;
};

// Placeholder image generator
const generatePlaceholderImage = (width = 400, height = 400) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
  return `${baseUrl}/api/placeholder/${width}/${height}`;
};

module.exports = {
  uploadImage: saveImageLocally,
  deleteImage: deleteLocalImage,
  getImageUrl,
  generatePlaceholderImage
};