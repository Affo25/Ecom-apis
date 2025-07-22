require('dotenv').config();

console.log('🔍 Environment Variables Check\n');

const requiredVars = [
  'MONGODB_URI',
  'JWT_SECRET',
];

const optionalVars = [
  'NODE_ENV',
  'PORT',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

console.log('📋 Required Environment Variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${varName === 'JWT_SECRET' ? '[SET]' : value}`);
  } else {
    console.log(`❌ ${varName}: [NOT SET]`);
  }
});

console.log('\n📋 Optional Environment Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value}`);
  } else {
    console.log(`⚠️  ${varName}: [NOT SET]`);
  }
});

// Check for common issues
console.log('\n🔍 Common Issues Check:');

if (!process.env.MONGODB_URI) {
  console.log('❌ MONGODB_URI is not set!');
  console.log('💡 Add this to your .env file:');
  console.log('MONGODB_URI=mongodb://localhost:27017/ecommerce');
  console.log('or for MongoDB Atlas:');
  console.log('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ecommerce');
}

if (!process.env.JWT_SECRET) {
  console.log('❌ JWT_SECRET is not set!');
  console.log('💡 Add this to your .env file:');
  console.log('JWT_SECRET=your-super-secret-jwt-key-here');
}

// Test MongoDB URI format
if (process.env.MONGODB_URI) {
  const uri = process.env.MONGODB_URI;
  if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
    console.log('✅ Using local MongoDB');
  } else if (uri.includes('mongodb.net')) {
    console.log('✅ Using MongoDB Atlas');
  } else {
    console.log('⚠️  Unknown MongoDB URI format');
  }
}

console.log('\n📝 Create a .env file in the server directory with:');
console.log('MONGODB_URI=mongodb://localhost:27017/ecommerce');
console.log('JWT_SECRET=your-super-secret-jwt-key-here-123456789');
console.log('NODE_ENV=development');
console.log('PORT=5009');