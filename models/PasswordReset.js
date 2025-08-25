const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  code: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: false // Generated after code verification
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5 // Maximum 5 attempts
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    index: { expireAfterSeconds: 0 } // MongoDB TTL index - auto delete when expires
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for cleanup and faster queries
passwordResetSchema.index({ email: 1, createdAt: -1 });
passwordResetSchema.index({ token: 1 });

// Method to check if code is expired
passwordResetSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Method to check if too many attempts
passwordResetSchema.methods.tooManyAttempts = function() {
  return this.attempts >= 5;
};

// Static method to clean up old records for an email
passwordResetSchema.statics.cleanupOldRecords = async function(email) {
  return this.deleteMany({ 
    email: email,
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isVerified: true, createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } } // Remove verified records older than 1 hour
    ]
  });
};

module.exports = mongoose.model('PasswordReset', passwordResetSchema);