const jwt = require('jsonwebtoken');

// Verify token middleware - Check cookies first, then fallback to Authorization header
const verifyToken = (req, res, next) => {
  // Try to get token from cookies first
  let token = req.cookies?.token;
  
  // If not in cookies, try Authorization header as fallback
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }
  
  console.log('🔐 Auth check:', {
    method: req.method,
    path: req.path,
    cookieToken: !!req.cookies?.token,
    headerToken: !!req.headers.authorization,
    finalToken: !!token
  });
  
  if (!token) {
    console.error('❌ No token found in cookies or headers');
    return res.status(401).json({ 
      success: false,
      error: 'Access token required. Please login again.' 
    });
  }
  
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET not configured');
    return res.status(500).json({ 
      success: false,
      error: 'Server configuration error' 
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token verified for user/admin:', decoded.id);
    
    // Set both req.admin and req.user for compatibility
    req.admin = decoded;
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token format. Please login again.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired. Please login again.' 
      });
    }
    return res.status(401).json({ 
      success: false,
      error: 'Token verification failed. Please login again.' 
    });
  }
};

module.exports = { verifyToken }; 