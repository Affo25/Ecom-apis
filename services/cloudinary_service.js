// // lib/uploadImage.js
// import cloudinary from './cloudinary';

// /**
//  * Upload an image to Cloudinary in a specified folder
//  * @param {string} imagePath - Path to the image (local path or base64)
//  * @param {'products' | 'categories' | 'banners' | 'logos'} folder
//  */
// export async function uploadImageToCloudinary(imagePath, folder) {
//   try {
//     const result = await cloudinary.uploader.upload(imagePath, {
//       folder: `myapp/${folder}`, // Example path: myapp/products/
//       resource_type: 'image',
//     });

//     return {
//       url: result.secure_url,
//       public_id: result.public_id,
//     };
//   } catch (error) {
//     console.error('Cloudinary upload error:', error);
//     throw error;
//   }
// }
