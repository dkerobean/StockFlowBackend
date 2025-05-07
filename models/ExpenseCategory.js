const mongoose = require('mongoose');

const expenseCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 600
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for default categories
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

expenseCategorySchema.index({ name: 1, createdBy: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);