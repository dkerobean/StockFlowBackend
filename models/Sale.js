const mongoose = require('mongoose');

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
saleSchema.post('save', async function(doc) {
  const Product = mongoose.model('Product');

  await Promise.all(doc.items.map(async item => {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { quantity: -item.quantity },
      $push: {
        auditLog: {
          user: doc.createdBy,
          action: 'sale',
          adjustment: -item.quantity,
          note: `Sold in sale ${doc._id}`,
          newQuantity: await getNewQuantity(item.product, item.quantity)
        }
      }
    });
  }));
});

async function getNewQuantity(productId, quantitySold) {
  const product = await mongoose.model('Product').findById(productId);
  return product.quantity - quantitySold;
}

module.exports = mongoose.model('Sale', saleSchema);