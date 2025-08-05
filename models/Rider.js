// models/Rider.js
const mongoose = require('mongoose');

const RiderSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, unique: true },
    address: { type: String, required: true }, // Added address field
    vehicleType: { type: String, enum: ["bike", "car", "van"], default: "bike" },
    licenseNumber: { type: String },
    image: { type: String, required: false },
    
    // CNIC Images
    cnicFrontImage: { type: String, required: false }, // CNIC front side image
    cnicBackImage: { type: String, required: false }, // CNIC back side image
    
    // Vehicle Document
    bikeDocument: { type: String, required: false }, // PDF file for bike/vehicle documents
    
    location: {
      type: { type: String, default: "Point" },
      coordinates: [Number], // [longitude, latitude]
    },
    isAvailable: { type: Boolean, default: true },

    assignedOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
  },
  { timestamps: true }
);

RiderSchema.index({ location: "2dsphere" }); // for geo queries

module.exports = mongoose.models.Rider || mongoose.model("Rider", RiderSchema);
