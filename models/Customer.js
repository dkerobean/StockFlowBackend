const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Customer code is required'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Customer email is required'],
    trim: true,
    lowercase: true,
    validate: {
      validator: function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please enter a valid email address'
    }
  },
  phone: {
    type: String,
    required: [true, 'Customer phone is required'],
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  image: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Indexes for better query performance
customerSchema.index({ customerName: 1 });
customerSchema.index({ code: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ status: 1 });

// Virtual for full address
customerSchema.virtual('fullAddress').get(function() {
  const addressParts = [this.address, this.city, this.country].filter(Boolean);
  return addressParts.join(', ');
});

// Ensure virtual fields are serialized
customerSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Customer', customerSchema);