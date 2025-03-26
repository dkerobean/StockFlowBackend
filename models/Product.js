const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');


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
  sku: {
    type: String,
    unique: true,
    trim: true,
    default: () => uuidv4()
  },
  category: {
    type: String,
    required: true,
    enum: ['Electronics', 'Clothing', 'Groceries', 'Tools', 'Other'],
    default: 'Other'
  },
  brand: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    required: true,
    enum: ['Warehouse A', 'Warehouse B', 'Store Front'],
    default: 'Warehouse A'
  },
  quantity: {
    type: Number,
    required: true,
    min: [0, 'Quantity cannot be negative'],
    default: 0
  },
  minStock: {
    type: Number,
    min: [0, 'Minimum stock cannot be negative'],
    default: 5
  },
  notifyAt: {  // Custom threshold for notifications
    type: Number,
    min: 0,
    default: function() { return this.minStock; } // Defaults to minStock
  },
  lastNotified: Date, // Prevent duplicate alerts
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
    required: true
  },
  barcode: {
    type: String,
    unique: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  auditLog: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,
    adjustment: Number,
    note: String,
    newQuantity: Number,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Indexes for faster querying
productSchema.index({ category: 1 });
productSchema.index({ location: 1 });
productSchema.index({ brand: 1 });

module.exports = mongoose.model('Product', productSchema);