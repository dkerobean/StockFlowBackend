// models/Sale.js
const mongoose = require('mongoose');
const Product = require('./Product');
const Income = require('./Income');
const Inventory = require('./Inventory'); // Import Inventory model
const Location = require('./Location'); // Import Location model

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: { // Price AT THE TIME OF SALE
    type: Number,
    required: true,
    min: 0.01
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {_id: false}); // No separate _id for subdocuments unless needed

const saleSchema = new mongoose.Schema({
  items: [saleItemSchema],
  subtotal: Number, // Calculated
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // Overall sale discount
  total: Number, // Calculated
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'debit_card', 'mobile_payment', 'other'],
    required: true
  },
  customer: {
    name: String,
    contact: String,
    email: String
  },
  location: { // Reference the Location model
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: [true, 'Sale location is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: String
}, { timestamps: true });

// --- Pre-Save Hooks for Calculation (Keep as is or refine) ---
saleSchema.pre('validate', function(next) {
    // Ensure price precision
    this.items.forEach(item => {
      if (typeof item.price === 'number') {
        item.price = parseFloat(item.price.toFixed(2));
      } else {
         // Handle potential errors if price isn't a number
         return next(new Error(`Invalid price format for an item.`));
      }
    });

    // Calculate subtotal based on item prices, quantities, and item discounts
    this.subtotal = parseFloat(this.items.reduce((sum, item) =>
      sum + (item.price * item.quantity * (1 - (item.discount || 0)/100)), 0).toFixed(2));

    // Calculate total including tax and overall sale discount
    this.total = parseFloat((this.subtotal + (this.tax || 0) - (this.discount || 0)).toFixed(2));

    if (this.total < 0) {
        this.total = 0; // Ensure total isn't negative
    }
    next();
});

// --- Post-Save Hook for Inventory and Income (MAJOR CHANGE) ---
saleSchema.post('save', async function(doc, next) {
  // Use a try-catch block for robust error handling in post hooks
  try {
    // --- Inventory Update Logic (Location Specific) ---
    await Promise.all(doc.items.map(async item => {
      const inventory = await Inventory.findOne({
        product: item.product,
        location: doc.location // Use the sale's location
      });

      if (!inventory) {
        // This case should ideally be caught during sale validation, but handle defensively
        console.error(`CRITICAL: Inventory record not found for product ${item.product} at location ${doc.location} during sale ${doc._id} post-save. Stock not updated.`);
        // Consider throwing an error or logging more permanently
        return; // Skip update for this item
      }

      if (inventory.quantity < item.quantity) {
         // This should also be caught in validation, but double-check
         console.error(`CRITICAL: Insufficient stock detected post-save for product ${item.product} at location ${doc.location} during sale ${doc._id}. Stock not updated.`);
         return; // Skip update
      }

      const newQuantity = inventory.quantity - item.quantity;

      await Inventory.updateOne(
        { _id: inventory._id },
        {
          $inc: { quantity: -item.quantity },
          $push: {
            auditLog: {
              user: doc.createdBy,
              action: 'sale',
              adjustment: -item.quantity,
              note: `Sold in sale ${doc._id}`,
              newQuantity: newQuantity,
              relatedSaleId: doc._id,
              timestamp: new Date()
            }
          }
        }
      );
      // Emit socket event for this specific inventory update
      // Need access to io instance (pass via options or use a global getter)
       if (global.io) { // Check if io is globally accessible (simplest way)
           global.io.to('products').to(`location_${doc.location.toString()}`).emit('inventoryUpdate', { // Emit to general products room AND location-specific room
               inventoryId: inventory._id,
               productId: item.product,
               locationId: doc.location,
               newQuantity: newQuantity,
               adjustment: -item.quantity,
               action: 'sale',
               saleId: doc._id
           });
       }

    }));

    // --- Automatic Income Record Creation ---
    if (doc.total > 0) {
        const incomeRecord = new Income({
            source: 'Sale',
            description: `Revenue from Sale ID: ${doc._id}`,
            amount: doc.total,
            date: doc.createdAt,
            relatedSale: doc._id,
            createdBy: doc.createdBy,
            location: doc.location // Optionally track income by location
        });
        await incomeRecord.save();
        console.log(`Successfully created income record for Sale ${doc._id}`);
    }

    next(); // Indicate successful completion

  } catch (error) {
    console.error(`Error in post-save hook for Sale ${doc._id}:`, error);
    // Decide how to handle this. The sale IS saved. Log it, alert admins.
    // This error won't roll back the sale itself.
    next(error); // Pass error if needed
  }
});

module.exports = mongoose.model('Sale', saleSchema);