// models/Inventory.js
const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
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
  notifyAt: {
    type: Number,
    min: 0,
    default: function() { return this.minStock; } // Defaults to minStock for this location
  },
  lastNotified: Date, // Prevent duplicate alerts for this specific stock level
  // Audit log specific to stock movements AT THIS LOCATION
  auditLog: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { // e.g., 'initial_stock', 'sale', 'adjustment', 'transfer_in', 'transfer_out'
      type: String,
      required: true
    },
    adjustment: Number, // Positive or negative change
    note: String,
    newQuantity: Number, // Quantity AFTER this action
    relatedSaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' }, 
    relatedTransferId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransfer' },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Ensure only one inventory record per product per location
inventorySchema.index({ product: 1, location: 1 }, { unique: true });
inventorySchema.index({ location: 1 });
inventorySchema.index({ quantity: 1 }); // For finding low stock items

module.exports = mongoose.model('Inventory', inventorySchema);