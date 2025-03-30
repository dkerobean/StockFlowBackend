// models/StockTransfer.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const stockTransferSchema = new mongoose.Schema({
  transferId: { // Human-readable unique ID for the transfer
    type: String,
    unique: true,
    default: () => `TR-${uuidv4().slice(0, 8).toUpperCase()}`
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Transfer quantity must be at least 1']
  },
  fromLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  toLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Shipped', 'Received', 'Cancelled'],
    default: 'Pending'
  },
  notes: String,
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shippedBy: { // User who marked it as shipped
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  receivedBy: { // User who marked it as received
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  shippedAt: Date,
  receivedAt: Date,
  cancelledAt: Date,
  cancellationReason: String
}, { timestamps: true });

stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ fromLocation: 1 });
stockTransferSchema.index({ toLocation: 1 });
stockTransferSchema.index({ product: 1 });
stockTransferSchema.index({ transferId: 1 });

// Prevent transferring to the same location
stockTransferSchema.pre('validate', function(next) {
  if (this.fromLocation && this.toLocation && this.fromLocation.equals(this.toLocation)) {
    next(new Error('Cannot transfer stock to the same location.'));
  } else {
    next();
  }
});


module.exports = mongoose.model('StockTransfer', stockTransferSchema);