// models/Brand.js
const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Brand name is required'],
    unique: true, // Ensure brand names are unique
    trim: true
  },
  createdBy: { // Optional: track who added the brand
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Or false if anonymous creation is allowed
  },
}, { timestamps: true });

brandSchema.index({ name: 1 });

module.exports = mongoose.model('Brand', brandSchema);