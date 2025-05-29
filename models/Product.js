// models/Product.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
// Keep Inventory model import if needed for hooks/methods, otherwise remove
// const Inventory = require('./Inventory'); // Can often be loaded dynamically in methods

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  imageUrl: {
    type: String,
    trim: true,
    default: ''
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductCategory',
    required: true
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand'
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  auditLog: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,
    changes: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Create indexes for faster queries
productSchema.index({ name: 1, createdBy: 1 });
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ barcode: 1 }, { unique: true, sparse: true });
productSchema.index({ category: 1 });

// Method to get total stock across all locations
productSchema.methods.getTotalStock = async function() {
  const Inventory = mongoose.model('Inventory'); // Load model dynamically
  const stockLevels = await Inventory.find({ product: this._id });
  return stockLevels.reduce((sum, item) => sum + item.quantity, 0);
};

// Method to get stock at a specific location
productSchema.methods.getStockAtLocation = async function(locationId) {
    const Inventory = mongoose.model('Inventory'); // Load model dynamically
    const inventory = await Inventory.findOne({ product: this._id, location: locationId });
    return inventory ? inventory.quantity : 0;
};

module.exports = mongoose.model('Product', productSchema);