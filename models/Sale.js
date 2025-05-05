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
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'refunded'],
    default: 'completed',
    required: true
  },
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

// --- Pre-Remove Hook for Reversal ---
saleSchema.pre('remove', async function(next) {
    console.log(`Attempting pre-remove actions for Sale ID: ${this._id}`);
    try {
        // --- Reverse Inventory Changes ---
        await Promise.all(this.items.map(async item => {
            const inventoryUpdate = await Inventory.findOneAndUpdate(
                { product: item.product, location: this.location },
                {
                    $inc: { quantity: item.quantity }, // Add quantity back
                    $push: {
                        auditLog: {
                            user: this.createdBy, // Or a system user ID if needed
                            action: 'sale_deleted',
                            adjustment: item.quantity, // Positive adjustment
                            note: `Reversed sale ${this._id}`,
                            // Calculating exact newQuantity might be complex if other changes happened,
                            // just log the adjustment. Can be refined if needed.
                            relatedSaleId: this._id,
                            timestamp: new Date()
                        }
                    }
                },
                { new: true } // Optionally return the updated doc
            );

            if (!inventoryUpdate) {
                 console.warn(`Inventory record not found for product ${item.product} at location ${this.location} during sale ${this._id} deletion reversal. Stock may be inconsistent.`);
                 // Decide if this should halt the process
            } else {
                 // Emit socket event for inventory update reversal
                 if (global.io) {
                     global.io.to('products').to(`location_${this.location.toString()}`).emit('inventoryUpdate', {
                         inventoryId: inventoryUpdate._id,
                         productId: item.product,
                         locationId: this.location,
                         newQuantity: inventoryUpdate.quantity, // The updated quantity
                         adjustment: item.quantity, // Positive adjustment
                         action: 'sale_deleted',
                         saleId: this._id
                     });
                 }
            }
        }));
        console.log(`Inventory reversal completed for Sale ID: ${this._id}`);

        // --- Delete Associated Income Record ---
        const relatedIncome = await Income.findOneAndDelete({ relatedSale: this._id });
        if (relatedIncome) {
            console.log(`Deleted associated income record ${relatedIncome._id} for Sale ID: ${this._id}`);
             // Optional: Emit income deletion event if needed
        } else {
             console.log(`No associated income record found for Sale ID: ${this._id}`);
        }


        next(); // Proceed with deletion
    } catch (error) {
        console.error(`Error during pre-remove hook for Sale ${this._id}:`, error);
        // Prevent deletion if reversal fails critically
        next(new Error(`Failed to reverse inventory/income for sale ${this._id}. Deletion aborted.`));
    }
});

module.exports = mongoose.model('Sale', saleSchema);