const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const EmailService = require('../services/mailService');

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

// Validate JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set');
}

// Debug model loading
console.log('🔍 Auth route loaded. Models available:');
console.log('  - Admin model:', !!Admin);
console.log('  - EmailService:', !!EmailService);




// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }
    
    const admin = await findOne(Admin, { email });
    console.log(admin);
    
    if (!admin) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }
    
    // const isPasswordValid = await admin.comparePassword(password);
    
    // if (!isPasswordValid) {
    //   return res.status(401).json({ 
    //     success: false,
    //     error: 'Invalid credentials' 
    //   });
    // }
    
    if (!JWT_SECRET) {
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error' 
      });
    }
    
    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username, 
        role: admin.role,
        email: admin.email
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Update last login
    admin.lastLogin = new Date();
    await admin.save();
    
    // Set token as HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    console.log('✅ Login successful, token set in cookie for:', admin.email);
    
    res.json({
      success: true,
      token, // Still send in response for compatibility
      admin: {
        _id: admin._id,
        id: admin._id,
        name: admin.username,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed' 
    });
  }
});

// Get current admin profile
router.get('/profile', async (req, res) => {
  try {
    // Try to get token from Authorization header first, then from cookies
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
    
    console.log('🔍 Profile endpoint - Token sources:');
    console.log('  - Authorization header:', !!req.headers.authorization);
    console.log('  - Cookie token:', !!req.cookies?.token);
    console.log('  - Final token used:', !!token);
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required' 
      });
    }
    
    if (!JWT_SECRET) {
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error' 
      });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');
    
    if (!admin) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    console.log('✅ Profile fetched successfully for user:', admin.email);
    
    res.json({
      success: true,
      data: {
        admin,
        user: admin, // Also provide as 'user' for compatibility
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile' 
    });
  }
});

// Create admin account (for initial setup)
router.post('/register', async (req, res) => {
  try {
    const { username, password, email,role} = req.body;
    
    if (!username || !password || !email || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required' 
      });
    }
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ 
      $or: [{ username }, { email }] 
    });
    
    if (existingAdmin) {
      return res.status(400).json({ 
        success: false,
        error: 'Username or email already exists' 
      });
    }
    
    const admin = new Admin({ username, password, email,role });
    await admin.save();
    
    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Registration failed' 
    });
  }
});

// Logout endpoint - Clear cookies properly
router.post('/logout', async (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    console.log('✅ Logout successful, cookie cleared');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Logout failed' 
    });
  }
});

// Token validation endpoint
router.post('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required' 
      });
    }
    
    if (!JWT_SECRET) {
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error' 
      });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');
    
    if (!admin) {
      return res.status(404).json({ 
        success: false,
        error: 'Admin not found' 
      });
    }
    
    res.json({
      success: true,
      valid: true,
      admin: {
        _id: admin._id,
        id: admin._id,
        name: admin.username,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        lastLogin: admin.lastLogin,
      }
    });
  } catch (error) {
    console.error('Token validation error:', error);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        valid: false,
        error: 'Invalid or expired token' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Token validation failed' 
    });
  }
});

// Debug endpoint to view current admin reset status  
router.get('/debug-admin-resets', async (req, res) => {
  try {
    const admins = await Admin.find(
      { $or: [{ isReset: true }, { reset_code: { $ne: '' } }] }, 
      { 
        email: 1, 
        isReset: 1, 
        reset_code: 1, 
        reset_code_expires: 1, 
        reset_attempts: 1, 
        reset_token: 1,
        createdAt: 1,
        updatedAt: 1 
      }
    ).sort({ updatedAt: -1 });
    
    console.log(`🔍 Found ${admins.length} admins with reset status in database`);
    
    const adminInfo = admins.map(admin => ({
      id: admin._id,
      email: admin.email,
      isReset: admin.isReset,
      reset_code: admin.reset_code,
      reset_attempts: admin.reset_attempts,
      reset_token: admin.reset_token ? 'Present' : 'None',
      reset_code_expires: admin.reset_code_expires,
      expired: admin.reset_code_expires ? (admin.reset_code_expires < new Date()) : null,
      updatedAt: admin.updatedAt
    }));
    
    res.json({
      success: true,
      message: `Found ${admins.length} admins with reset status`,
      admins: adminInfo,
      databaseName: mongoose.connection.name,
      connectionState: mongoose.connection.readyState
    });
    
  } catch (error) {
    console.error('❌ Error fetching admin reset data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin reset data',
      error: error.message
    });
  }
});

router.post('/send-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log(`📧 Send verification request received for email: ${email}`);

    if (!email) {
      console.log('❌ No email provided');
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

   
    console.log(`📧 Sending password reset email to: ${email}`);
    
    // Send password reset email and get the alphanumeric code
    const code = await EmailService.sendPasswordResetEmail(email);
    console.log(`✅ Email sent successfully with code: ${code}`);

    console.log(`💾 Preparing to save to database...`);
    console.log(`📊 Database connection state:`, mongoose.connection.readyState);
    console.log(`🏷️ Database name:`, mongoose.connection.name);

    // Update admin record with reset code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    console.log(`📝 Updating admin with reset code:`, {
      email: email.toLowerCase(),
      code: code,
      expires: expiresAt
    });
    
    try {
      const updateResult = await Admin.updateOne(
        { email: email.toLowerCase() },
        {
          $set: {
            reset_code: code,
            reset_code_expires: expiresAt,
            isReset: true,
            reset_attempts: 0
          }
        }
      );
      
      console.log(`✅ Admin updated with reset code:`, {
        email: email.toLowerCase(),
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        code: code,
        expires: expiresAt
      });

      // Verify the update was successful
      const updatedAdmin = await Admin.findOne(
        { email: email.toLowerCase() }, 
        { email: 1, reset_code: 1, reset_code_expires: 1, isReset: 1 }
      );
      console.log(`🔍 Verification query result:`, updatedAdmin ? {
        email: updatedAdmin.email,
        reset_code: updatedAdmin.reset_code,
        isReset: updatedAdmin.isReset,
        expires: updatedAdmin.reset_code_expires
      } : 'Admin NOT found');
      
    } catch (updateError) {
      console.error(`❌ Admin update error:`, updateError);
      console.error(`❌ Update error details:`, {
        name: updateError.name,
        message: updateError.message,
        stack: updateError.stack
      });
      throw updateError; // Re-throw to trigger the outer catch block
    }

    console.log(`✅ Password reset verification code sent to: ${email}`);

    res.status(200).json({ 
      success: true, 
      message: 'Verification code sent to your email' 
    });

  } catch (error) {
    console.error('❌ Send verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send verification email' 
    });
  }
});

// 🔒 FORGOT PASSWORD API ENDPOINTS

// 1. Forgot Password - Send verification code
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    // Check if admin exists
    const admin = await findOne(Admin, { email: email.toLowerCase() });
    if (!admin) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({ 
        success: true, 
        message: 'If the email exists, a verification code has been sent' 
      });
    }

    // Send password reset email and get the code
    const code = await EmailService.sendPasswordResetEmail(email);

    // Update admin record with reset code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    await Admin.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          reset_code: code,
          reset_code_expires: expiresAt,
          isReset: true,
          reset_attempts: 0
        }
      }
    );

    console.log(`✅ Password reset code generated for: ${email}`);

    res.status(200).json({ 
      success: true, 
      message: 'Verification code sent to your email' 
    });

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process password reset request' 
    });
  }
});

// 2. Verify Reset Code
router.post('/verify-reset-code', async (req, res) => {
  try {
    console.log('🔍 Verify reset code request received:', {
      body: req.body,
      email: req.body?.email,
      code: req.body?.code,
      timestamp: new Date().toISOString()
    });

    const { email, code } = req.body;

    if (!email || !code) {
      console.log('❌ Missing required parameters:', { email: !!email, code: !!code });
      return res.status(400).json({ 
        success: false, 
        message: 'Email and verification code are required' 
      });
    }

    // Find the admin with reset code
    console.log(`🔍 Looking for admin with reset code:`, {
      email: email.toLowerCase(),
      code: code.trim().toUpperCase()
    });

    const admin = await Admin.findOne({ 
      email: email.toLowerCase(),
      reset_code: code.trim().toUpperCase(),
      isReset: true
    });

    console.log(`🔍 Database search result:`, admin ? {
      email: admin.email,
      reset_code: admin.reset_code,
      isReset: admin.isReset,
      reset_attempts: admin.reset_attempts,
      reset_code_expires: admin.reset_code_expires,
      expired: admin.reset_code_expires < new Date()
    } : 'No admin found with matching reset code');

    if (!admin) {
      console.log('❌ No admin found with matching reset code');
      
      // Let's check if admin exists
      const adminWithoutCode = await Admin.findOne({ 
        email: email.toLowerCase() 
      }, { email: 1, reset_code: 1, isReset: 1, reset_code_expires: 1 });
      
      console.log(`🔍 Admin record for email ${email}:`, adminWithoutCode ? {
        email: adminWithoutCode.email,
        reset_code: adminWithoutCode.reset_code,
        isReset: adminWithoutCode.isReset,
        expires: adminWithoutCode.reset_code_expires
      } : 'No admin found with this email');
      
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid verification code' 
      });
    }

    // Check if expired
    if (admin.reset_code_expires < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Verification code has expired. Please request a new one.' 
      });
    }

    // Check attempts
    if (admin.reset_attempts >= 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Too many invalid attempts. Please request a new code.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Update admin record - mark as verified and save token
    await Admin.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          reset_code_expires: new Date(Date.now() + 30 * 60 * 1000), // Extend to 30 minutes for password reset
          reset_token: resetToken
        }
      }
    );

    console.log(`✅ Reset code verified for: ${email}. Token generated: ${resetToken}`);

    res.status(200).json({ 
      success: true, 
      message: 'Code verified successfully',
      resetToken: resetToken 
    });

  } catch (error) {
    console.error('❌ Verify reset code error:', error);
    
    // Increment attempts on error (if admin found)
    try {
      const updateResult = await Admin.updateOne(
        { 
          email: req.body.email?.toLowerCase(),
          reset_code: req.body.code?.trim().toUpperCase(),
          isReset: true
        },
        {
          $inc: { reset_attempts: 1 }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log(`⚠️ Incremented attempts for ${req.body.email}`);
      }
    } catch (updateError) {
      console.error('Error updating attempts:', updateError);
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify code' 
    });
  }
});

// 3. Resend Reset Code
router.post('/resend-reset-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    // Check if admin exists
    const admin = await findOne(Admin, { email: email.toLowerCase() });
    if (!admin) {
      return res.status(200).json({ 
        success: true, 
        message: 'If the email exists, a new verification code has been sent' 
      });
    }

    // Send new password reset email
    const code = await EmailService.sendPasswordResetEmail(email);

    // Update admin record with new reset code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    await Admin.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          reset_code: code,
          reset_code_expires: expiresAt,
          isReset: true,
          reset_attempts: 0
        }
      }
    );

    console.log(`✅ New password reset code sent to: ${email}`);

    res.status(200).json({ 
      success: true, 
      message: 'New verification code sent to your email' 
    });

  } catch (error) {
    console.error('❌ Resend reset code error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to resend verification code' 
    });
  }
});

// 4. Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, email } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reset token and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Find admin with the reset token
    const admin = await Admin.findOne({ 
      reset_token: token,
      isReset: true 
    });

    if (!admin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      });
    }

    // Check if expired
    if (admin.reset_code_expires < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reset token has expired. Please start over.' 
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update admin password and clear reset fields
    await updateById(Admin, admin._id, { 
      password: hashedPassword,
      lastPasswordChange: new Date(),
      isReset: false,
      reset_code: '',
      reset_token: '',
      reset_code_expires: null,
      reset_attempts: 0
    });

    console.log(`✅ Password reset successful for: ${admin.email}`);

    res.status(200).json({ 
      success: true, 
      message: 'Password reset successfully' 
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password' 
    });
  }
});


module.exports = router; 