const mongoose = require('mongoose');
const Product = require('./Product');
const Income = require('./Income');

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
  price: {
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
});

const saleSchema = new mongoose.Schema({
  items: [saleItemSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
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
  location: {
    type: String,
    enum: ['Warehouse A', 'Warehouse B', 'Store Front'],
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: String
}, { timestamps: true });

// Calculate totals before saving

saleSchema.pre('validate', function(next) {
  if (this.isNew && this.items) {
    this.items.forEach(item => {
      item.price = parseFloat(item.price.toFixed(2));
    });

    this.subtotal = parseFloat(this.items.reduce((sum, item) =>
      sum + (item.price * item.quantity * (1 - item.discount/100)), 0).toFixed(2));

    this.total = parseFloat((this.subtotal + this.tax - this.discount).toFixed(2));
  }
  next();
});

saleSchema.pre('save', function(next) {
  this.items.forEach(item => {
    item.price = parseFloat(item.price.toFixed(2));
  });

  this.subtotal = parseFloat(this.items.reduce((sum, item) =>
    sum + (item.price * item.quantity * (1 - item.discount/100)), 0).toFixed(2));

  this.total = parseFloat((this.subtotal + this.tax - this.discount).toFixed(2));
  next();
});

// Update inventory after sale
// saleSchema.post('save', async function(doc) {
//   const Product = mongoose.model('Product');

//   await Promise.all(doc.items.map(async item => {
//     await Product.findByIdAndUpdate(item.product, {
//       $inc: { quantity: -item.quantity },
//       $push: {
//         auditLog: {
//           user: doc.createdBy,
//           action: 'sale',
//           adjustment: -item.quantity,
//           note: `Sold in sale ${doc._id}`,
//           newQuantity: await getNewQuantity(item.product, item.quantity)
//         }
//       }
//     });
//   }));
// });
saleSchema.post('save', async function(doc, next) {
  try {
    // --- Existing Inventory Update Logic ---
    await Promise.all(doc.items.map(async item => {
      const product = await Product.findById(item.product);
      let currentQuantity = product ? product.quantity : 0; // Handle if product somehow deleted mid-process
      let newQuantity = currentQuantity - item.quantity;

      await Product.findByIdAndUpdate(item.product, {
        $inc: { quantity: -item.quantity },
        $push: {
          auditLog: {
            user: doc.createdBy,
            action: 'sale',
            adjustment: -item.quantity,
            note: `Sold in sale ${doc._id}`,
            newQuantity: newQuantity, // Use calculated new quantity
            timestamp: new Date()
          }
        }
      });
    }));

    // --- NEW: Automatic Income Record Creation ---
    if (doc.total > 0) { // Only record income if the total is positive
        const incomeRecord = new Income({
            source: 'Sale',
            description: `Revenue from Sale ID: ${doc._id}`,
            amount: doc.total,
            date: doc.createdAt, // Use the sale's creation date/time
            relatedSale: doc._id,
            createdBy: doc.createdBy
        });
        await incomeRecord.save();
        console.log(`Successfully created income record for Sale ${doc._id}`);
    }
    // --- End of Automatic Income Record Creation ---

    next(); // Indicate successful completion of the hook

  } catch (error) {
    // --- Error Handling for Post-Save Hook ---
    console.error(`Error in post-save hook for Sale ${doc._id}:`, error);
    // Decide how to handle this. Log it? Send an alert?
    // For now, we log it and call next(error) to potentially signal the issue upstream if needed.
    // Be cautious: the sale is ALREADY saved at this point. This hook failure doesn't roll back the sale.
    next(error); // Pass the error to the next middleware/error handler if defined
    // --- End of Error Handling ---
  }
});

async function getNewQuantity(productId, quantitySold) {
  const product = await mongoose.model('Product').findById(productId);
  return product.quantity - quantitySold;
}

module.exports = mongoose.model('Sale', saleSchema);