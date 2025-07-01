const mongoose = require('mongoose');

// Purchase Item Schema (subdocument)
const purchaseItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product is required']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  unitCost: {
    type: Number,
    required: [true, 'Unit cost is required'],
    min: [0, 'Unit cost cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  taxRate: {
    type: Number,
    default: 0,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%']
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: [0, 'Tax amount cannot be negative']
  },
  lineTotal: {
    type: Number,
    min: [0, 'Line total cannot be negative'],
    default: 0
  }
});

// Main Purchase Schema
const purchaseSchema = new mongoose.Schema({
  purchaseNumber: {
    type: String,
    unique: true,
    trim: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: [true, 'Supplier is required']
  },
  purchaseDate: {
    type: Date,
    required: [true, 'Purchase date is required'],
    default: Date.now
  },
  dueDate: {
    type: Date
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'ordered', 'received', 'cancelled', 'partial'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid'
  },
  items: [purchaseItemSchema],
  
  // Financial details
  subtotal: {
    type: Number,
    min: [0, 'Subtotal cannot be negative'],
    default: 0
  },
  orderTax: {
    type: Number,
    default: 0,
    min: [0, 'Order tax cannot be negative']
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: [0, 'Discount amount cannot be negative']
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: [0, 'Shipping cost cannot be negative']
  },
  grandTotal: {
    type: Number,
    min: [0, 'Grand total cannot be negative'],
    default: 0
  },
  
  // Payment tracking
  amountPaid: {
    type: Number,
    default: 0,
    min: [0, 'Amount paid cannot be negative']
  },
  amountDue: {
    type: Number,
    default: 0,
    min: [0, 'Amount due cannot be negative']
  },
  
  // Additional details
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  },
  receivedDate: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Tracking fields
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Indexes for better query performance
purchaseSchema.index({ purchaseNumber: 1 });
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ status: 1 });
purchaseSchema.index({ paymentStatus: 1 });
purchaseSchema.index({ purchaseDate: 1 });
purchaseSchema.index({ createdBy: 1 });
purchaseSchema.index({ isActive: 1 });

// Compound indexes
purchaseSchema.index({ supplier: 1, status: 1 });
purchaseSchema.index({ status: 1, paymentStatus: 1 });
purchaseSchema.index({ isActive: 1, status: 1 });

// Virtual fields
purchaseSchema.virtual('totalItems').get(function() {
  return this.items ? this.items.length : 0;
});

purchaseSchema.virtual('totalQuantity').get(function() {
  return this.items ? this.items.reduce((total, item) => total + item.quantity, 0) : 0;
});

// Pre-save middleware to auto-generate purchase number
purchaseSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.purchaseNumber) {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      // Count existing purchases for the current year and month
      const count = await this.constructor.countDocuments({
        purchaseNumber: { $regex: `^PO${year}${month}` }
      });
      
      this.purchaseNumber = `PO${year}${month}${(count + 1).toString().padStart(4, '0')}`;
    }
    
    // Ensure default values for financial fields
    this.orderTax = this.orderTax || 0;
    this.shippingCost = this.shippingCost || 0;
    this.discountAmount = this.discountAmount || 0;
    this.amountPaid = this.amountPaid || 0;
    
    // Calculate amounts if items exist
    if (this.items && this.items.length > 0) {
      // Validate and calculate line totals for each item
      this.items.forEach((item, index) => {
        // Ensure all numeric fields are valid numbers
        const unitCost = Number(item.unitCost) || 0;
        const quantity = Number(item.quantity) || 0;
        const discount = Number(item.discount) || 0;
        const taxRate = Number(item.taxRate) || 0;
        
        // Validate required fields
        if (!unitCost || unitCost < 0) {
          throw new Error(`Item ${index + 1}: Unit cost must be a positive number`);
        }
        if (!quantity || quantity < 1) {
          throw new Error(`Item ${index + 1}: Quantity must be at least 1`);
        }
        
        // Update item with validated values
        item.unitCost = unitCost;
        item.quantity = quantity;
        item.discount = discount;
        item.taxRate = taxRate;
        
        // Calculate tax amount
        const baseAmount = unitCost * quantity - discount;
        const taxAmount = baseAmount * (taxRate / 100);
        item.taxAmount = Math.round(taxAmount * 100) / 100;
        
        // Calculate line total
        item.lineTotal = Math.round((baseAmount + item.taxAmount) * 100) / 100;
        
        // Validate calculation results
        if (isNaN(item.lineTotal) || item.lineTotal < 0) {
          throw new Error(`Item ${index + 1}: Invalid line total calculation`);
        }
      });
      
      // Calculate subtotal
      this.subtotal = Math.round(this.items.reduce((total, item) => {
        const itemSubtotal = (item.unitCost * item.quantity) - item.discount;
        return total + itemSubtotal;
      }, 0) * 100) / 100;
      
      // Calculate total tax from items
      const totalTax = Math.round(this.items.reduce((total, item) => 
        total + (item.taxAmount || 0), 0) * 100) / 100;
      
      // Calculate grand total
      const orderTax = Number(this.orderTax) || 0;
      const shippingCost = Number(this.shippingCost) || 0;
      const discountAmount = Number(this.discountAmount) || 0;
      
      this.grandTotal = Math.round((this.subtotal + totalTax + orderTax + shippingCost - discountAmount) * 100) / 100;
      
      // Calculate amount due
      const amountPaid = Number(this.amountPaid) || 0;
      this.amountDue = Math.round((this.grandTotal - amountPaid) * 100) / 100;
      
      // Validate final calculations
      if (isNaN(this.subtotal) || isNaN(this.grandTotal)) {
        throw new Error('Invalid calculation results - please check all numeric inputs');
      }
    } else {
      // No items - set defaults
      this.subtotal = 0;
      this.grandTotal = 0;
      this.amountDue = 0;
    }
    
    // Update payment status based on amounts
    if (this.amountPaid === 0) {
      this.paymentStatus = 'unpaid';
    } else if (this.amountPaid >= this.grandTotal) {
      this.paymentStatus = 'paid';
    } else {
      this.paymentStatus = 'partial';
    }
    
    // Final validation of calculated fields
    if (this.items && this.items.length > 0) {
      // Validate that all line totals are calculated
      for (let i = 0; i < this.items.length; i++) {
        if (isNaN(this.items[i].lineTotal) || this.items[i].lineTotal < 0) {
          throw new Error(`Invalid line total calculation for item ${i + 1}`);
        }
      }
      
      // Validate that main totals are calculated
      if (isNaN(this.subtotal) || this.subtotal < 0) {
        throw new Error('Invalid subtotal calculation');
      }
      
      if (isNaN(this.grandTotal) || this.grandTotal < 0) {
        throw new Error('Invalid grand total calculation');
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Ensure virtual fields are serialized
purchaseSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Purchase', purchaseSchema);