const mongoose = require('mongoose');

const attributeSchema = new mongoose.Schema({
  attribute_name: String,
  attribute_value: String,
}, { _id: false });

const variantSchema = new mongoose.Schema({
  variant_id: mongoose.Schema.Types.ObjectId,
  sku: String,
  price: Number,
  sale_price: Number,
  quantity_in_stock: Number,
  attributes: [attributeSchema],
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  rating: Number,
  comment: String,
  created_at: { type: Date, default: Date.now },
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  short_description: String,
  sku: String,
  brand_id: String,
  categories: [String],
  tags: [String],
  price: { type: Number, required: true },
  sale_price: Number,
  currency: { type: String, default: 'USD' },
  quantity_in_stock: { type: Number, default: 0 },
  stock_status: { 
    type: String, 
    enum: ['in_stock', 'out_of_stock', 'preorder'], 
    default: 'in_stock' 
  },
  weight: Number,
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
  },
  shipping_class: String,
  images: [String],
  videos: [String],
  attributes: [attributeSchema],
  variants: [variantSchema],
  meta_title: String,
  meta_description: String,
  meta_keywords: [String],
  rating_average: { type: Number, default: 0 },
  rating_count: { type: Number, default: 0 },
  reviews: [reviewSchema],
  featured: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Add pre-save middleware to update the updated_at field
productSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Create and export the Product model
const Product = mongoose.model('Product', productSchema);

module.exports = Product;

