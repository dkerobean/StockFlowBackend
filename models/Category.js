// models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true
  },
  slug: { // <-- ADDED FIELD
        type: String,
        trim: true,
        unique: true, // Slugs must be unique for URLs
        lowercase: true // Slugs are typically lowercase
    },
    status: { // <-- ADDED FIELD
        type: String,
        required: true,
        enum: ['active', 'inactive'], // Restrict possible values
        default: 'active' // Set a default status
    },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Or false if anonymous creation is allowed
  },
  // You could add parentCategory for hierarchies later if needed:
  // parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null }
}, { timestamps: true });

categorySchema.index({ name: 1 });

module.exports = mongoose.model('Category', categorySchema);