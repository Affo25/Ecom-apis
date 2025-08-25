/**
 * Cloudflare R2 Image Service
 * Handles single and multiple image uploads to Cloudflare R2 storage
 * and manages MongoDB image URL updates
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Rider = require('../models/Rider');
const { CMS } = require('../models/Cms');

class R2ImageService {
  constructor() {
    // Check R2 credentials
    const requiredEnvVars = [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_ACCESS_KEY_ID', 
      'CLOUDFLARE_SECRET_ACCESS_KEY',
      'CLOUDFLARE_R2_BUCKET_NAME'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('❌ Missing R2 environment variables:', missingVars);
      throw new Error(`Missing required R2 environment variables: ${missingVars.join(', ')}`);
    }
    
    console.log('🔧 R2 Configuration:', {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID?.substring(0, 8) + '...',
      bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
    });
    
    // Initialize R2 client with Cloudflare credentials
    this.r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
      },
      forcePathStyle: false, // Use virtual-hosted-style requests
      signatureVersion: 'v4'
    });
    
    this.bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
    // Use custom domain if available, otherwise use default R2 format
    this.baseUrl = process.env.CLOUDFLARE_R2_DOMAIN 
      ? `https://${process.env.CLOUDFLARE_R2_DOMAIN}` 
      : `https://${this.bucketName}.${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }

  /**
   * Generate a unique filename based on custom naming pattern
   * @param {string} originalName - Original file name
   * @param {string} category - Image category (products, categories, riders, etc.)
   * @param {string} subCategory - Sub category or identifier
   * @returns {string} Generated filename
   */
  generateFileName(originalName, category = 'general', subCategory = '') {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop().toLowerCase();
    
    const cleanName = originalName
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
      .toLowerCase();
    
    const subCat = subCategory ? `${subCategory}_` : '';
    return `${category}/${subCat}${timestamp}_${randomId}_${cleanName}.${extension}`;
  }

  /**
   * Upload a single image to Cloudflare R2
   * @param {Object} file - Image file to upload (multer file object)
   * @param {string} category - Category folder (products, categories, subcategories, riders, cms)
   * @param {string} subCategory - Optional subcategory
   * @returns {Promise<Object>} Upload result with URL and metadata
   */
  async uploadSingleImage(file, category = 'general', subCategory = '') {
    try {
      console.log(`🔄 Starting R2 upload for category: ${category}`);
      
      if (!file || !file.buffer) {
        throw new Error('Invalid file object - missing buffer');
      }

      const key = this.generateFileName(file.originalname || file.name, category, subCategory);
      
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || file.type,
        Metadata: {
          category: category,
          subCategory: subCategory,
          originalName: file.originalname || file.name,
          uploadedAt: new Date().toISOString()
        }
      });

      await this.r2Client.send(uploadCommand);
      
      const imageUrl = `${this.baseUrl}/${key}`;
      
      console.log(`✅ Image uploaded successfully!`);
      console.log(`📍 Generated URL: ${imageUrl}`);
      console.log(`🔑 Key: ${key}`);
      console.log(`🌐 Base URL: ${this.baseUrl}`);
      
      return {
        success: true,
        url: imageUrl,
        key: key,
        category: category,
        subCategory: subCategory,
        originalName: file.originalname || file.name,
        size: file.size,
        contentType: file.mimetype || file.type
      };
      
    } catch (error) {
      console.error('❌ R2 Upload Error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode
      });
      
      // Enhanced error handling for common R2/S3 errors
      if (error.name === 'CredentialsProviderError' || error.message.includes('InvalidAccessKeyId')) {
        console.error('❌ R2 Authentication Error - Check your credentials in .env file');
        throw new Error('R2 authentication failed. Please check your Cloudflare R2 credentials.');
      } else if (error.message.includes('NoSuchBucket')) {
        console.error('❌ R2 Bucket Error - Bucket does not exist or not accessible');
        throw new Error(`R2 bucket "${this.bucketName}" not found or not accessible.`);
      } else if (error.message.includes('SignatureDoesNotMatch')) {
        console.error('❌ R2 Signature Error - Check your secret access key');
        throw new Error('R2 signature mismatch. Please verify your secret access key.');
      } else if (error.name === 'NetworkingError') {
        console.error('❌ R2 Network Error - Connection failed');
        throw new Error('Failed to connect to Cloudflare R2. Please check your network connection.');
      }
      
      throw new Error(`Failed to upload image: ${error.message}`);
    }
  }

  /**
   * Upload multiple images to Cloudflare R2
   * @param {Array} files - Array of image files to upload
   * @param {string} category - Category folder
   * @param {string} subCategory - Optional subcategory
   * @returns {Promise<Array>} Array of upload results
   */
  async uploadMultipleImages(files, category = 'general', subCategory = '') {
    try {
      console.log(`🔄 Starting batch R2 upload: ${files.length} files for category: ${category}`);
      
      const uploadPromises = files.map(file => 
        this.uploadSingleImage(file, category, subCategory)
      );
      
      const results = await Promise.all(uploadPromises);
      
      console.log(`✅ Batch upload completed: ${results.length} images uploaded`);
      
      return results;
    } catch (error) {
      console.error('❌ Batch R2 Upload Error:', error);
      throw new Error(`Failed to upload multiple images: ${error.message}`);
    }
  }

  /**
   * Delete an image from Cloudflare R2
   * @param {string} imageUrl - Full image URL or key
   * @returns {Promise<boolean>} Success status
   */
  async deleteImage(imageUrl) {
    try {
      // Extract key from URL if full URL is provided
      const key = imageUrl.includes(this.baseUrl) 
        ? imageUrl.replace(`${this.baseUrl}/`, '') 
        : imageUrl;
      
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.r2Client.send(deleteCommand);
      
      console.log(`✅ Image deleted successfully: ${key}`);
      return true;
      
    } catch (error) {
      console.error('❌ R2 Delete Error:', error);
      return false;
    }
  }

  /**
   * Delete multiple images from Cloudflare R2
   * @param {Array<string>} imageUrls - Array of image URLs to delete
   * @returns {Promise<Object>} Deletion results
   */
  async deleteMultipleImages(imageUrls) {
    try {
      const deletePromises = imageUrls.map(url => this.deleteImage(url));
      const results = await Promise.all(deletePromises);
      
      const successCount = results.filter(result => result === true).length;
      
      console.log(`✅ Batch deletion completed: ${successCount}/${imageUrls.length} images deleted`);
      
      return {
        total: imageUrls.length,
        successful: successCount,
        failed: imageUrls.length - successCount,
        results: results
      };
      
    } catch (error) {
      console.error('❌ Batch R2 Delete Error:', error);
      throw new Error(`Failed to delete multiple images: ${error.message}`);
    }
  }

  /**
   * Get image URL (for compatibility, since R2 URLs are direct)
   * @param {string} key - Image key or filename
   * @returns {string} Full image URL
   */
  getImageUrl(key) {
    if (key.startsWith('http')) {
      return key; // Already a full URL
    }
    return `${this.baseUrl}/${key}`;
  }

  // =======================================================================
  // MongoDB Integration Methods for Different Model Types
  // =======================================================================

  /**
   * Upload and save product images
   * @param {string} productId - MongoDB product ID
   * @param {Array} imageFiles - Array of image files
   * @param {boolean} replaceExisting - Whether to replace existing images
   * @returns {Promise<Object>} Updated product data
   */
  async uploadProductImages(productId, imageFiles, replaceExisting = false) {
    try {
      // Upload images to R2
      const uploadResults = await this.uploadMultipleImages(imageFiles, 'products', productId);
      const imageUrls = uploadResults.map(result => result.url);
      
      // Get existing product to handle image replacement
      const existingProduct = await Product.findById(productId);
      if (!existingProduct) {
        throw new Error('Product not found');
      }
      
      let updatedImages = imageUrls;
      
      if (!replaceExisting && existingProduct.images) {
        // Append to existing images
        updatedImages = [...existingProduct.images, ...imageUrls];
      } else if (replaceExisting && existingProduct.images) {
        // Delete old images from R2
        await this.deleteMultipleImages(existingProduct.images);
      }
      
      // Update product in MongoDB
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { images: updatedImages },
        { new: true }
      );
      
      return {
        success: true,
        product: updatedProduct,
        uploadedImages: imageUrls,
        totalImages: updatedImages.length
      };
      
    } catch (error) {
      console.error('❌ Product Image Upload Error:', error);
      throw new Error(`Failed to upload product images: ${error.message}`);
    }
  }

  /**
   * Upload and save category image
   * @param {string} categoryId - MongoDB category ID
   * @param {Object} imageFile - Image file
   * @param {string} imageType - 'image' or 'icon'
   * @returns {Promise<Object>} Updated category data
   */
  async uploadCategoryImage(categoryId, imageFile, imageType = 'image') {
    try {
      // Get existing category to delete old image
      const existingCategory = await Category.findById(categoryId);
      if (!existingCategory) {
        throw new Error('Category not found');
      }
      
      // Upload new image to R2
      const uploadResult = await this.uploadSingleImage(imageFile, 'categories', categoryId);
      
      // Delete old image if exists
      if (existingCategory[imageType]) {
        await this.deleteImage(existingCategory[imageType]);
      }
      
      // Update category in MongoDB
      const updateData = { [imageType]: uploadResult.url };
      
      const updatedCategory = await Category.findByIdAndUpdate(
        categoryId,
        updateData,
        { new: true }
      );
      
      return {
        success: true,
        category: updatedCategory,
        uploadedImage: uploadResult.url,
        imageType: imageType
      };
      
    } catch (error) {
      console.error('❌ Category Image Upload Error:', error);
      throw new Error(`Failed to upload category image: ${error.message}`);
    }
  }

  /**
   * Upload and save subcategory image
   * @param {string} subcategoryId - MongoDB subcategory ID
   * @param {Object} imageFile - Image file
   * @param {string} imageType - 'image' or 'icon'
   * @returns {Promise<Object>} Updated subcategory data
   */
  async uploadSubcategoryImage(subcategoryId, imageFile, imageType = 'image') {
    try {
      // Get existing subcategory
      const existingSubcategory = await Subcategory.findById(subcategoryId);
      if (!existingSubcategory) {
        throw new Error('Subcategory not found');
      }
      
      // Upload new image to R2
      const uploadResult = await this.uploadSingleImage(imageFile, 'subcategories', subcategoryId);
      
      // Delete old image if exists
      if (existingSubcategory[imageType]) {
        await this.deleteImage(existingSubcategory[imageType]);
      }
      
      // Update subcategory in MongoDB
      const updateData = { [imageType]: uploadResult.url };
      
      const updatedSubcategory = await Subcategory.findByIdAndUpdate(
        subcategoryId,
        updateData,
        { new: true }
      );
      
      return {
        success: true,
        subcategory: updatedSubcategory,
        uploadedImage: uploadResult.url,
        imageType: imageType
      };
      
    } catch (error) {
      console.error('❌ Subcategory Image Upload Error:', error);
      throw new Error(`Failed to upload subcategory image: ${error.message}`);
    }
  }

  /**
   * Upload and save rider images (profile, CNIC front/back, documents)
   * @param {string} riderId - MongoDB rider ID
   * @param {Object} imageFiles - Object containing different image types
   * @returns {Promise<Object>} Updated rider data
   */
  async uploadRiderImages(riderId, imageFiles) {
    try {
      // Get existing rider
      const existingRider = await Rider.findById(riderId);
      if (!existingRider) {
        throw new Error('Rider not found');
      }
      
      const updateData = {};
      const uploadPromises = [];
      
      // Define image type mappings
      const imageTypes = {
        image: 'profile',
        cnicFrontImage: 'cnic_front',
        cnicBackImage: 'cnic_back',
        bikeDocument: 'documents'
      };
      
      // Process each image type
      for (const [fieldName, subCategory] of Object.entries(imageTypes)) {
        if (imageFiles[fieldName]) {
          uploadPromises.push(
            this.uploadSingleImage(imageFiles[fieldName], 'riders', `${riderId}_${subCategory}`)
              .then(result => {
                updateData[fieldName] = result.url;
                
                // Delete old image if exists
                if (existingRider[fieldName]) {
                  this.deleteImage(existingRider[fieldName]);
                }
                
                return result;
              })
          );
        }
      }
      
      // Wait for all uploads to complete
      const uploadResults = await Promise.all(uploadPromises);
      
      // Update rider in MongoDB
      const updatedRider = await Rider.findByIdAndUpdate(
        riderId,
        updateData,
        { new: true }
      );
      
      return {
        success: true,
        rider: updatedRider,
        uploadedImages: uploadResults,
        updatedFields: Object.keys(updateData)
      };
      
    } catch (error) {
      console.error('❌ Rider Images Upload Error:', error);
      throw new Error(`Failed to upload rider images: ${error.message}`);
    }
  }

  /**
   * Upload and save CMS images (banners, logos, etc.)
   * @param {Object} imageFiles - Object containing different CMS image types
   * @returns {Promise<Object>} Updated CMS data
   */
  async uploadCMSImages(imageFiles) {
    try {
      // Get existing CMS data
      const existingCMS = await CMS.findOne({ isActive: true });
      if (!existingCMS) {
        throw new Error('CMS configuration not found');
      }
      
      const updateData = {};
      
      // Handle banner images
      if (imageFiles.bannerImages && imageFiles.bannerImages.length > 0) {
        const bannerUploadResults = await this.uploadMultipleImages(
          imageFiles.bannerImages, 
          'cms', 
          'banners'
        );
        
        // Delete old banner images
        if (existingCMS.banner && existingCMS.banner.images) {
          const oldImageUrls = existingCMS.banner.images.map(img => img.url);
          await this.deleteMultipleImages(oldImageUrls);
        }
        
        // Format banner images for CMS schema
        updateData.banner = {
          ...existingCMS.banner,
          images: bannerUploadResults.map((result, index) => ({
            id: `banner_${Date.now()}_${index}`,
            url: result.url,
            alt: `Banner image ${index + 1}`,
            title: `Banner ${index + 1}`,
            order: index
          }))
        };
      }
      
      // Handle logo image
      if (imageFiles.logoImage) {
        const logoUploadResult = await this.uploadSingleImage(
          imageFiles.logoImage, 
          'cms', 
          'logo'
        );
        
        // Delete old logo
        if (existingCMS.logo && existingCMS.logo.logoUrl) {
          await this.deleteImage(existingCMS.logo.logoUrl);
        }
        
        updateData.logo = {
          ...existingCMS.logo,
          logoUrl: logoUploadResult.url
        };
      }
      
      // Handle favicon
      if (imageFiles.faviconImage) {
        const faviconUploadResult = await this.uploadSingleImage(
          imageFiles.faviconImage, 
          'cms', 
          'favicon'
        );
        
        // Delete old favicon
        if (existingCMS.logo && existingCMS.logo.faviconUrl) {
          await this.deleteImage(existingCMS.logo.faviconUrl);
        }
        
        if (!updateData.logo) {
          updateData.logo = { ...existingCMS.logo };
        }
        updateData.logo.faviconUrl = faviconUploadResult.url;
      }
      
      // Update CMS in MongoDB
      const updatedCMS = await CMS.findByIdAndUpdate(
        existingCMS._id,
        updateData,
        { new: true }
      );
      
      return {
        success: true,
        cms: updatedCMS,
        uploadedFields: Object.keys(updateData)
      };
      
    } catch (error) {
      console.error('❌ CMS Images Upload Error:', error);
      throw new Error(`Failed to upload CMS images: ${error.message}`);
    }
  }

  /**
   * Test R2 connection and configuration
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      // Check if required environment variables are set
      const requiredEnvVars = [
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_ACCESS_KEY_ID',
        'CLOUDFLARE_SECRET_ACCESS_KEY',
        'CLOUDFLARE_R2_BUCKET_NAME',
        'CLOUDFLARE_R2_DOMAIN'
      ];

      const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
      
      if (missingVars.length > 0) {
        console.warn(`❌ Missing R2 environment variables: ${missingVars.join(', ')}`);
        return false;
      }

      // Try to perform a simple operation to test connection
      // Create a small test object and immediately delete it
      const testKey = `test/connection-test-${Date.now()}.txt`;
      const testContent = 'R2 connection test';
      
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: testKey,
        Body: Buffer.from(testContent, 'utf-8'),
        ContentType: 'text/plain'
      });

      await this.r2Client.send(putCommand);
      
      // Clean up test file
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: testKey
      });

      await this.r2Client.send(deleteCommand);
      
      console.log('✅ R2 connection test successful');
      return true;
      
    } catch (error) {
      console.error('❌ R2 connection test failed:', error);
      return false;
    }
  }
}

module.exports = R2ImageService;