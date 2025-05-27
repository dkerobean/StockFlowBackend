const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  supplierName: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Supplier code is required'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Supplier email is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Supplier phone is required'],
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  image: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

supplierSchema.index({ supplierName: 1 });
supplierSchema.index({ code: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);