// models/Product.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
// Keep Inventory model import if needed for hooks/methods, otherwise remove
// const Inventory = require('./Inventory'); // Can often be loaded dynamically in methods

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
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
    unique: true,
    trim: true,
    default: () => uuidv4()
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Product category is required'] // Category is required
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: false                    
  },
  price: { // Base selling price
    type: Number,
    min: [0.01, 'Price must be at least 0.01'],
    required: true,
    set: v => parseFloat(v.toFixed(2))
  },
  barcode: {
    type: String,
    unique: true, // Ensure barcodes are unique across all products
    trim: true,
    sparse: true // Allow multiple products without a barcode
  },
  isActive: { // To phase out a product without deleting inventory records
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

// Indexes (Updated for ObjectId refs)
productSchema.index({ name: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ category: 1 }); // Now indexes the ObjectId ref
productSchema.index({ brand: 1 });   // Now indexes the ObjectId ref
productSchema.index({ barcode: 1 });

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