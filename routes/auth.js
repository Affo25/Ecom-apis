const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Validate JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set');
}




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
    
    const admin = await Admin.findOne({ email });
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
      admin
    });
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    
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

// Test auth endpoint - Protected route to verify authentication
router.get('/test', require('../middleware/auth').verifyToken, (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Authentication working!',
      admin: {
        id: req.admin.id,
        email: req.admin.email,
        username: req.admin.username,
        role: req.admin.role
      },
      tokenSource: req.cookies?.token ? 'cookie' : 'header',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Auth test error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Auth test failed' 
    });
  }
});

module.exports = router; 