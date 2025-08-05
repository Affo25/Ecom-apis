const mongoose = require('mongoose');

// Banner Image Schema
const bannerImageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  url: { type: String, required: true },
  alt: { type: String, default: '' },
  title: { type: String, default: '' },
  order: { type: Number, default: 0 }
}, { _id: false });

// Company Value Schema
const valueSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, maxlength: 50 },
  description: { type: String, maxlength: 200 }
}, { _id: false });

// Menu Item Schema (with support for nested children)
const menuItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, maxlength: 50, required: true },
  url: { type: String, required: true },
  order: { type: Number, default: 0 },
  isExternal: { type: Boolean, default: false },
  openInNewTab: { type: Boolean, default: false },
  children: [{ type: mongoose.Schema.Types.Mixed }] // Allows nested menu items
}, { _id: false });

// Footer Menu Item Schema (simpler than header menu)
const footerMenuItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, maxlength: 50, required: true },
  url: { type: String, required: true },
  order: { type: Number, default: 0 },
  isExternal: { type: Boolean, default: false }
}, { _id: false });

// Main CMS Schema
const cmsSchema = new mongoose.Schema({
    theme_name:{type:String,default:'theme2'},
  // Banner Section
  banner: {
    images: {
      type: [bannerImageSchema],
      validate: [arrayLimit(5), 'Banner can have maximum 5 images']
    },
    headline: {
      type: String,
      maxlength: 100,
      default: ''
    },
    subheadline: {
      type: String,
      maxlength: 200,
      default: ''
    },
    ctaText: {
      type: String,
      maxlength: 50,
      default: ''
    },
    ctaLink: {
      type: String,
      default: ''
    }
  },

  // Logo and Branding Section
  logo: {
    logoUrl: {
      type: String,
      default: ''
    },
    logoAlt: {
      type: String,
      maxlength: 100,
      default: 'Company Logo'
    },
    faviconUrl: {
      type: String,
      default: ''
    },
    brandColors: {
      primary: { type: String, default: '#7c3aed' },
      secondary: { type: String, default: '#6366f1' },
      accent: { type: String, default: '#f59e0b' }
    }
  },

  // Text Content Section
  textContent: {
    companyName: {
      type: String,
      maxlength: 100,
      required: true
    },
    tagline: {
      type: String,
      maxlength: 150,
      default: ''
    },
    aboutUs: {
      type: String,
      maxlength: 1000,
      default: ''
    },
    mission: {
      type: String,
      maxlength: 500,
      default: ''
    },
    vision: {
      type: String,
      maxlength: 500,
      default: ''
    },
    values: {
      type: [valueSchema],
      validate: [arrayLimit(6), 'Maximum 6 company values allowed']
    }
  },

  // Navigation Menus Section
  menus: {
    headerMenu: {
      type: [menuItemSchema],
      validate: [arrayLimit(10), 'Header menu can have maximum 10 items']
    },
    footerMenu: {
      type: [footerMenuItemSchema],
      validate: [arrayLimit(15), 'Footer menu can have maximum 15 items']
    }
  },

  // Footer Section
  footer: {
    copyright: {
      type: String,
      maxlength: 200,
      default: ''
    },
    contactInfo: {
      address: {
        type: String,
        maxlength: 300,
        default: ''
      },
      phone: {
        type: String,
        validate: {
          validator: function(v) {
            return /^[+]?[0-9\s\-\(\)]+$/.test(v) || v === '';
          },
          message: 'Invalid phone number format'
        },
        default: ''
      },
      email: {
        type: String,
        validate: {
          validator: function(v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v === '';
          },
          message: 'Invalid email format'
        },
        default: ''
      },
      workingHours: {
        type: String,
        maxlength: 100,
        default: ''
      }
    },
    socialLinks: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      youtube: { type: String, default: '' },
      tiktok: { type: String, default: '' }
    },
    newsletter: {
      enabled: { type: Boolean, default: true },
      title: {
        type: String,
        maxlength: 100,
        default: ''
      },
      description: {
        type: String,
        maxlength: 200,
        default: ''
      }
    }
  },

  // Metadata
  isActive: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Array length validator function
function arrayLimit(val) {
  return function(arr) {
    return arr.length <= val;
  };
}

// Pre-save middleware to update the updated_at field
cmsSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Static method to get or create the CMS configuration
cmsSchema.statics.getConfig = async function() {
  let config = await this.findOne({ isActive: true });
  
  if (!config) {
    // Create default configuration if none exists
    config = new this({
      textContent: {
        companyName: 'Your Company Name'
      }
    });
    await config.save();
  }
  
  return config;
};

// Instance method to validate URL format
cmsSchema.methods.validateUrl = function(url) {
  if (!url) return true; // Empty URLs are allowed
  const urlPattern = /^(https?:\/\/)?([\w\-])+\.{1}([a-zA-Z]{2,63})([\/\w\-._~:?#[\]@!$&'()*+,;=]*)?$/;
  return urlPattern.test(url);
};

// Create and export the CMS model
const CMS = mongoose.model('CMS', cmsSchema);

// Export the model and schema for use in other parts of the application
module.exports = {
  CMS,
  cmsSchema,
  
  // Export validation schema for frontend use
  CMS_MODAL_SCHEMA: {
      client_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
    banner: {
      type: 'object',
      properties: {
        images: { type: 'array', maxItems: 5 },
        headline: { type: 'string', maxLength: 100 },
        subheadline: { type: 'string', maxLength: 200 },
        ctaText: { type: 'string', maxLength: 50 },
        ctaLink: { type: 'string' }
      }
    },
    logo: {
      type: 'object',
      properties: {
        logoUrl: { type: 'string' },
        logoAlt: { type: 'string', maxLength: 100 },
        faviconUrl: { type: 'string' },
        brandColors: {
          type: 'object',
          properties: {
            primary: { type: 'string', default: '#7c3aed' },
            secondary: { type: 'string', default: '#6366f1' },
            accent: { type: 'string', default: '#f59e0b' }
          }
        }
      }
    },
    textContent: {
      type: 'object',
      properties: {
        companyName: { type: 'string', maxLength: 100, required: true },
        tagline: { type: 'string', maxLength: 150 },
        aboutUs: { type: 'string', maxLength: 1000 },
        mission: { type: 'string', maxLength: 500 },
        vision: { type: 'string', maxLength: 500 },
        values: { type: 'array', maxItems: 6 }
      }
    },
    menus: {
      type: 'object',
      properties: {
        headerMenu: { type: 'array', maxItems: 10 },
        footerMenu: { type: 'array', maxItems: 15 }
      }
    },
    footer: {
      type: 'object',
      properties: {
        copyright: { type: 'string', maxLength: 200 },
        contactInfo: {
          type: 'object',
          properties: {
            address: { type: 'string', maxLength: 300 },
            phone: { type: 'string' },
            email: { type: 'string' },
            workingHours: { type: 'string', maxLength: 100 }
          }
        },
        socialLinks: {
          type: 'object',
          properties: {
            facebook: { type: 'string' },
            twitter: { type: 'string' },
            instagram: { type: 'string' },
            linkedin: { type: 'string' },
            youtube: { type: 'string' },
            tiktok: { type: 'string' }
          }
        },
        newsletter: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            title: { type: 'string', maxLength: 100 },
            description: { type: 'string', maxLength: 200 }
          }
        }
      }
    }
  }
};