// models/Location.js
const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true,
    unique: true 
  },
  storeCode: {
    type: String,
    unique: true,
    trim: true,
    sparse: true // Allows multiple null values but unique non-null values
  },
  address: {
    street: String,
    city: String,
    region: String,
    country: String,
    zipCode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  type: {
    type: String,
    required: true,
    enum: ['Store', 'Warehouse', 'Distribution Center', 'Outlet'],
    default: 'Store'
  },
  status: {
    type: String,
    enum: ['operational', 'maintenance', 'closed', 'setup'],
    default: 'operational'
  },
  contactPerson: {
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(email) {
          return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },
        message: 'Please enter a valid email address'
      }
    },
    phone: {
      type: String,
      trim: true
    },
    position: {
      type: String,
      trim: true
    }
  },
  storeManager: {
    type: String,
    trim: true
  },
  operatingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  storeSize: {
    type: String,
    enum: ['Small', 'Medium', 'Large', 'Extra Large'],
    trim: true
  },
  setupDate: {
    type: Date
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
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Indexes for better query performance
locationSchema.index({ name: 1 });
locationSchema.index({ type: 1 });
locationSchema.index({ status: 1 });
locationSchema.index({ storeCode: 1 });
locationSchema.index({ 'contactPerson.email': 1 });
locationSchema.index({ 'address.city': 1 });
locationSchema.index({ 'address.region': 1 });
locationSchema.index({ isActive: 1 });

// Compound indexes
locationSchema.index({ type: 1, status: 1 });
locationSchema.index({ isActive: 1, status: 1 });

// Virtual for full address
locationSchema.virtual('fullAddress').get(function() {
  if (!this.address) return '';
  const addressParts = [
    this.address.street,
    this.address.city,
    this.address.region,
    this.address.country
  ].filter(Boolean);
  return addressParts.join(', ');
});

// Virtual for contact info
locationSchema.virtual('contactInfo').get(function() {
  if (!this.contactPerson || !this.contactPerson.name) return 'No contact person';
  return `${this.contactPerson.name}${this.contactPerson.position ? ' (' + this.contactPerson.position + ')' : ''}`;
});

// Pre-save middleware to auto-generate store code
locationSchema.pre('save', async function(next) {
  if (this.isNew && !this.storeCode) {
    // Generate store code based on type and sequence
    const prefix = this.type === 'Store' ? 'ST' : 
                  this.type === 'Warehouse' ? 'WH' : 
                  this.type === 'Distribution Center' ? 'DC' : 'OT';
    
    const count = await this.constructor.countDocuments({ type: this.type });
    this.storeCode = `${prefix}${(count + 1).toString().padStart(3, '0')}`;
  }
  next();
});

// Ensure virtual fields are serialized
locationSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Location', locationSchema);