// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'low_stock',
      'out_of_stock', 
      'expiry_warning',
      'stock_adjustment',
      'sale_completed',
      'transfer_completed',
      'system_alert',
      'user_activity'
    ]
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    // Flexible data storage for notification-specific information
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    transferId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransfer' },
    adjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quantity: Number,
    threshold: Number,
    expiryDate: Date,
    amount: Number,
    additionalData: mongoose.Schema.Types.Mixed
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  targetUsers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isRead: { type: Boolean, default: false },
    readAt: Date
  }],
  targetRoles: [{
    type: String,
    enum: ['admin', 'manager', 'staff']
  }],
  targetLocations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  }],
  isGlobal: {
    type: Boolean,
    default: false // If true, visible to all users regardless of role/location
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: Date,
  expiresAt: {
    type: Date,
    default: function() {
      // Notifications expire after 30 days
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for system-generated notifications
  }
}, { 
  timestamps: true,
  // Automatically remove expired notifications
  expireAfterSeconds: 0,
  expireAfterSeconds: { expiresAt: 1 }
});

// Indexes for efficient querying
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ priority: 1, createdAt: -1 });
notificationSchema.index({ 'targetUsers.user': 1, 'targetUsers.isRead': 1 });
notificationSchema.index({ targetRoles: 1, createdAt: -1 });
notificationSchema.index({ targetLocations: 1, createdAt: -1 });
notificationSchema.index({ isGlobal: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }); // For TTL

// Virtual for unread count per user
notificationSchema.virtual('unreadCount').get(function() {
  return this.targetUsers.filter(tu => !tu.isRead).length;
});

// Method to mark as read for a specific user
notificationSchema.methods.markAsReadForUser = function(userId) {
  const targetUser = this.targetUsers.find(tu => tu.user.toString() === userId.toString());
  if (targetUser && !targetUser.isRead) {
    targetUser.isRead = true;
    targetUser.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to check if user can see this notification
notificationSchema.methods.canUserSee = function(user) {
  // Global notifications are visible to everyone
  if (this.isGlobal) return true;
  
  // Check if user is specifically targeted
  if (this.targetUsers.some(tu => tu.user.toString() === user._id.toString())) {
    return true;
  }
  
  // Check if user's role is targeted
  if (this.targetRoles.includes(user.role)) return true;
  
  // Check if user has access to targeted locations
  if (this.targetLocations.length > 0 && user.locations) {
    return this.targetLocations.some(locId => 
      user.locations.some(userLocId => userLocId.toString() === locId.toString())
    );
  }
  
  return false;
};

// Static method to create system notification
notificationSchema.statics.createSystemNotification = async function(notificationData) {
  const notification = new this({
    ...notificationData,
    createdBy: null // System generated
  });
  return await notification.save();
};

// Static method to create notification for specific users
notificationSchema.statics.createUserNotification = async function(notificationData, userIds) {
  const targetUsers = userIds.map(userId => ({
    user: userId,
    isRead: false
  }));
  
  const notification = new this({
    ...notificationData,
    targetUsers
  });
  return await notification.save();
};

// Static method to create role-based notification
notificationSchema.statics.createRoleNotification = async function(notificationData, roles) {
  const notification = new this({
    ...notificationData,
    targetRoles: roles
  });
  return await notification.save();
};

module.exports = mongoose.model('Notification', notificationSchema);