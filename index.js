const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const serverless = require('serverless-http');
require('dotenv').config();

const app = express();

// 🌐 Trust proxy for serverless platforms (Vercel, Netlify, Cloudflare Workers)
app.set('trust proxy', 1);

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.CLIENT_URL,
      process.env.ADMIN_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    ].filter(Boolean);

    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    console.log('❌ CORS blocked origin:', origin);
    return callback(null, true); // fallback allow for testing
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ✅ Rate limiter setup
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
});

const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 50,
  message: { error: 'Too many analytics requests' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip || 'unknown') + req.headers['user-agent'],
});

app.use(generalLimiter);
app.use('/api/admin/analytics', analyticsLimiter);

// MongoDB connection cache
let cachedConnection = null;
const connectDB = async () => {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set');
  }

  cachedConnection = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });

  mongoose.connection.on('error', () => (cachedConnection = null));
  mongoose.connection.on('disconnected', () => (cachedConnection = null));

  return cachedConnection;
};

// Middleware to ensure DB connection
const ensureDbConnection = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// Placeholder route
app.get('/api/placeholder/:width/:height', (req, res) => {
  const w = parseInt(req.params.width) || 64;
  const h = parseInt(req.params.height) || 64;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="#E5E7EB"/>
      <rect x="${w/4}" y="${h/4}" width="${w/2}" height="${h/2}" rx="4" fill="#9CA3AF"/>
    </svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development',
    vercel: !!process.env.VERCEL,
  });
});

// R2 test
app.get('/api/upload/test', (req, res) => {
  res.json({
    success: true,
    storage: 'Cloudflare R2',
    note: 'Local uploads disabled in favor of R2',
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/products', ensureDbConnection, require('./routes/products'));
app.use('/api/orders', ensureDbConnection, require('./routes/orders'));
app.use('/api/admin', ensureDbConnection, require('./routes/admin'));
app.use('/api/auth', ensureDbConnection, require('./routes/auth'));
app.use('/api/cms', ensureDbConnection, require('./routes/cms'));
app.use('/api/r2-images', ensureDbConnection, require('./routes/r2Images'));

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ success: false, message: err.message });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Local server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}

// Export for Vercel
module.exports = serverless(app);
