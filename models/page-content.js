// models/page-content.js
const mongoose = require('mongoose');

const PageContentSchema = new mongoose.Schema(
  {
    pageName: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    featuredImage: { 
      type: String, 
      default: undefined,  // Use undefined instead of null to avoid duplicate key issues
      sparse: true  // Allow multiple documents without this field
    },
    pageTitle: { type: String, required: true },
    pageDescription: { type: String, default: "" },
    status:{type: String, enum: ["draft", "published", "archived"], default: "draft"},
    pageContent: { 
      type: mongoose.Schema.Types.Mixed, 
      default: {} 
    }, // JSON object containing HTML content and other structured data
  },
  { timestamps: true }
);

// Create sparse index for featuredImage to allow multiple null/undefined values
PageContentSchema.index(
  { featuredImage: 1 }, 
  { 
    sparse: true  // Don't include documents where featuredImage is null/undefined
  }
);


module.exports = mongoose.models.PageContent || mongoose.model("pages-content", PageContentSchema);
