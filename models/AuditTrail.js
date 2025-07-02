const mongoose = require('mongoose');

const auditTrailSchema = new mongoose.Schema({
  // Core audit information
  action: {
    type: String,
    required: true,
    enum: [
      // Inventory actions
      'inventory_created',
      'inventory_updated',
      'inventory_deleted',
      'stock_adjustment',
      'stock_transfer',
      'low_stock_alert',
      
      // Purchase actions
      'purchase_created',
      'purchase_updated',
      'purchase_received',
      'purchase_cancelled',
      'purchase_payment',
      
      // Sales actions
      'sale_created',
      'sale_updated',
      'sale_cancelled',
      'sale_refund',
      
      // System actions
      'user_login',
      'user_logout',
      'settings_changed',
      'report_generated',
      'data_export',
      'data_import'
    ]
  },
  
  // Actor information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    required: true
  },
  
  // Target information
  entityType: {
    type: String,
    required: true,
    enum: ['inventory', 'purchase', 'sale', 'product', 'supplier', 'customer', 'user', 'system']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityName: {
    type: String // Human-readable name/identifier
  },
  
  // Change details
  changes: {
    before: mongoose.Schema.Types.Mixed, // Previous state
    after: mongoose.Schema.Types.Mixed,  // New state
    fields: [String] // List of changed fields
  },
  
  // Additional context
  description: {
    type: String,
    required: true
  },
  ipAddress: String,
  userAgent: String,
  sessionId: String,
  
  // Metadata
  metadata: {
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location'
    },
    relatedDocuments: [{
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'metadata.relatedType'
    }],
    relatedType: {
      type: String,
      enum: ['Purchase', 'Sale', 'Inventory', 'Product', 'User']
    },
    quantityChange: Number,
    valueChange: Number,
    urgencyLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    }
  },
  
  // System information
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  source: {
    type: String,
    enum: ['web_app', 'mobile_app', 'api', 'system', 'import'],
    default: 'web_app'
  },
  version: {
    type: String, // Application version when action occurred
    default: '1.0.0'
  }
}, {
  timestamps: true,
  collection: 'audittrails'
});

// Indexes for performance
auditTrailSchema.index({ timestamp: -1 });
auditTrailSchema.index({ userId: 1, timestamp: -1 });
auditTrailSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditTrailSchema.index({ action: 1, timestamp: -1 });
auditTrailSchema.index({ 'metadata.urgencyLevel': 1, timestamp: -1 });

// TTL index to automatically delete old audit records (optional)
// auditTrailSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 }); // 1 year

// Static methods
auditTrailSchema.statics.logAction = async function(actionData) {
  try {
    const auditEntry = new this(actionData);
    return await auditEntry.save();
  } catch (error) {
    console.error('Failed to log audit action:', error);
    // Don't throw error to prevent breaking main operations
    return null;
  }
};

auditTrailSchema.statics.getActivityTimeline = async function(entityType, entityId, limit = 50) {
  return await this.find({
    entityType,
    entityId
  })
  .populate('userId', 'name email')
  .populate('metadata.location', 'name')
  .sort({ timestamp: -1 })
  .limit(limit);
};

auditTrailSchema.statics.getUserActivity = async function(userId, days = 30, limit = 100) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.find({
    userId,
    timestamp: { $gte: startDate }
  })
  .populate('metadata.location', 'name')
  .sort({ timestamp: -1 })
  .limit(limit);
};

auditTrailSchema.statics.getSecurityEvents = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.find({
    action: { $in: ['user_login', 'user_logout', 'settings_changed'] },
    timestamp: { $gte: startDate }
  })
  .populate('userId', 'name email')
  .sort({ timestamp: -1 });
};

auditTrailSchema.statics.getCriticalEvents = async function(hours = 24) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);
  
  return await this.find({
    'metadata.urgencyLevel': 'critical',
    timestamp: { $gte: startDate }
  })
  .populate('userId', 'name email')
  .populate('metadata.location', 'name')
  .sort({ timestamp: -1 });
};

// Instance methods
auditTrailSchema.methods.toSummary = function() {
  return {
    id: this._id,
    action: this.action,
    user: {
      id: this.userId,
      email: this.userEmail,
      role: this.userRole
    },
    entity: {
      type: this.entityType,
      id: this.entityId,
      name: this.entityName
    },
    description: this.description,
    timestamp: this.timestamp,
    urgency: this.metadata?.urgencyLevel || 'medium'
  };
};

module.exports = mongoose.model('AuditTrail', auditTrailSchema);