const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
   client_id: {
    type: mongoose.Schema.Types.ObjectId,
  },
  image: {
    type: String,
    default: null
  },
  icon: {
    type: String,
    default: null
  },
  color: {
    type: String,
    default: '#6B7280'
  },
  sort_order: {
    type: Number,
    default: 0
  },
  is_active: {
    type: Boolean,
    default: true
  },
  is_featured: {
    type: Boolean,
    default: false
  },
  product_count: {
    type: Number,
    default: 0
  },
  meta_title: String,
  meta_description: String,
  meta_keywords: [String],
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  updated_at: { 
    type: Date, 
    default: Date.now 
  }
});

// Add pre-save middleware to update the updated_at field
subcategorySchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Remove virtual field to avoid conflicts with direct population
// We'll populate parent_id directly instead

// Create and export the Subcategory model
const Subcategory = mongoose.model('Subcategory', subcategorySchema);

module.exports = Subcategory;