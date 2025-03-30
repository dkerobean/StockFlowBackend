// models/Location.js
const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true,
    unique: true // Ensure location names are unique
  },
  address: { // Optional: More detailed address
    street: String,
    region: String,
  },
  type: {
    type: String,
    required: true,
    enum: ['Store', 'Warehouse'], // Define types of locations
    default: 'Store'
  },
  isActive: { // To deactivate a location without deleting data
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

locationSchema.index({ name: 1 });
locationSchema.index({ type: 1 });

module.exports = mongoose.model('Location', locationSchema);