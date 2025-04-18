// models/Brand.js
const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Brand name is required'],
    unique: true, // Ensure brand names are unique
    trim: true
  },
  status: { 
        type: String,
        required: true,
        enum: ['active', 'inactive'], // Restrict possible values
        default: 'active' // Set a default status
    },
  createdBy: { // Optional: track who added the brand
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Or false if anonymous creation is allowed
  },
}, { timestamps: true });

brandSchema.index({ name: 1 });

module.exports = mongoose.model('Brand', brandSchema);