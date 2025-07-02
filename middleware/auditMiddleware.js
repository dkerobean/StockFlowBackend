const AuditTrail = require('../models/AuditTrail');

/**
 * Comprehensive audit middleware for tracking all system activities
 * Integrates with MongoDB MCP for optimized logging and querying
 */

class AuditMiddleware {
  
  /**
   * Create audit middleware for specific entity types
   */
  static createAuditMiddleware(entityType) {
    return {
      // Pre-save middleware to capture before state
      preSave: async function(next) {
        try {
          if (!this.isNew) {
            // Store original document for comparison
            this._original = await this.constructor.findById(this._id).lean();
          }
          next();
        } catch (error) {
          next(error);
        }
      },

      // Post-save middleware to log changes
      postSave: async function(doc, next) {
        try {
          const action = doc.isNew ? `${entityType}_created` : `${entityType}_updated`;
          
          let changes = {};
          if (!doc.isNew && doc._original) {
            changes = AuditMiddleware.calculateChanges(doc._original, doc.toObject());
          }

          const auditData = {
            action,
            userId: doc.modifiedBy || doc.createdBy,
            userEmail: 'system@stockflow.com', // Will be populated from middleware
            userRole: 'system',
            entityType: entityType,
            entityId: doc._id,
            entityName: doc.name || doc.title || doc.purchaseNumber || doc.saleNumber || 'Unknown',
            description: doc.isNew 
              ? `Created new ${entityType}: ${doc.name || doc._id}`
              : `Updated ${entityType}: ${doc.name || doc._id}`,
            changes: doc.isNew ? null : changes,
            metadata: {
              location: doc.location || doc.warehouse,
              urgencyLevel: 'medium'
            }
          };

          await AuditTrail.logAction(auditData);
          next();
        } catch (error) {
          console.error('Audit logging failed:', error);
          next(); // Don't fail the main operation
        }
      },

      // Post-remove middleware
      postRemove: async function(doc, next) {
        try {
          const auditData = {
            action: `${entityType}_deleted`,
            userId: doc.modifiedBy || doc.createdBy,
            userEmail: 'system@stockflow.com',
            userRole: 'system',
            entityType: entityType,
            entityId: doc._id,
            entityName: doc.name || doc.title || doc.purchaseNumber || doc.saleNumber || 'Unknown',
            description: `Deleted ${entityType}: ${doc.name || doc._id}`,
            changes: {
              before: doc.toObject(),
              after: null,
              fields: ['deleted']
            },
            metadata: {
              location: doc.location || doc.warehouse,
              urgencyLevel: 'high'
            }
          };

          await AuditTrail.logAction(auditData);
          next();
        } catch (error) {
          console.error('Audit logging failed:', error);
          next();
        }
      }
    };
  }

  /**
   * Express middleware to capture user context
   */
  static captureUserContext() {
    return (req, res, next) => {
      // Store user context for audit logging
      req.auditContext = {
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        sessionId: req.session?.id
      };
      next();
    };
  }

  /**
   * Manual audit logging for controller actions
   */
  static async logControllerAction(action, entityType, entityId, description, context, metadata = {}) {
    try {
      const auditData = {
        action,
        userId: context.userId,
        userEmail: context.userEmail,
        userRole: context.userRole,
        entityType,
        entityId,
        description,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        metadata: {
          ...metadata,
          urgencyLevel: metadata.urgencyLevel || 'medium'
        }
      };

      return await AuditTrail.logAction(auditData);
    } catch (error) {
      console.error('Manual audit logging failed:', error);
      return null;
    }
  }

  /**
   * Enhanced purchase receiving audit
   */
  static async logPurchaseReceiving(purchaseId, purchaseData, inventoryUpdates, context) {
    try {
      const auditData = {
        action: 'purchase_received',
        userId: context.userId,
        userEmail: context.userEmail,
        userRole: context.userRole,
        entityType: 'purchase',
        entityId: purchaseId,
        entityName: purchaseData.purchaseNumber,
        description: `Purchase ${purchaseData.purchaseNumber} received - ${inventoryUpdates.length} inventory records updated`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        metadata: {
          location: purchaseData.warehouse,
          quantityChange: inventoryUpdates.reduce((sum, update) => sum + update.adjustment, 0),
          valueChange: purchaseData.grandTotal,
          urgencyLevel: 'medium',
          relatedDocuments: inventoryUpdates.map(update => update.inventoryId).filter(Boolean),
          relatedType: 'Inventory',
          inventoryUpdates: inventoryUpdates.map(update => ({
            productId: update.productId,
            action: update.action,
            quantityChange: update.adjustment,
            newQuantity: update.newQuantity
          }))
        }
      };

      return await AuditTrail.logAction(auditData);
    } catch (error) {
      console.error('Purchase receiving audit failed:', error);
      return null;
    }
  }

  /**
   * Inventory adjustment audit
   */
  static async logInventoryAdjustment(inventoryId, productName, adjustment, reason, context, metadata = {}) {
    try {
      const auditData = {
        action: 'stock_adjustment',
        userId: context.userId,
        userEmail: context.userEmail,
        userRole: context.userRole,
        entityType: 'inventory',
        entityId: inventoryId,
        entityName: productName,
        description: `Stock ${adjustment > 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustment)} units: ${reason}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          ...metadata,
          quantityChange: adjustment,
          urgencyLevel: Math.abs(adjustment) > 100 ? 'high' : 'medium'
        }
      };

      return await AuditTrail.logAction(auditData);
    } catch (error) {
      console.error('Inventory adjustment audit failed:', error);
      return null;
    }
  }

  /**
   * Low stock alert audit
   */
  static async logLowStockAlert(inventoryId, productName, currentQuantity, minStock, context) {
    try {
      const auditData = {
        action: 'low_stock_alert',
        userId: context.userId || 'system',
        userEmail: context.userEmail || 'system@stockflow.com',
        userRole: context.userRole || 'system',
        entityType: 'inventory',
        entityId: inventoryId,
        entityName: productName,
        description: `Low stock alert: ${productName} has ${currentQuantity} units (minimum: ${minStock})`,
        metadata: {
          quantityChange: currentQuantity - minStock,
          urgencyLevel: currentQuantity === 0 ? 'critical' : 'high',
          alertThreshold: minStock,
          currentLevel: currentQuantity
        }
      };

      return await AuditTrail.logAction(auditData);
    } catch (error) {
      console.error('Low stock alert audit failed:', error);
      return null;
    }
  }

  /**
   * Calculate changes between two objects
   */
  static calculateChanges(original, updated) {
    const changes = {
      before: {},
      after: {},
      fields: []
    };

    // Get all unique keys from both objects
    const allKeys = new Set([...Object.keys(original), ...Object.keys(updated)]);

    for (const key of allKeys) {
      // Skip internal mongoose fields
      if (key.startsWith('_') || key === '__v' || key === 'updatedAt') {
        continue;
      }

      const originalValue = original[key];
      const updatedValue = updated[key];

      // Check if values are different
      if (JSON.stringify(originalValue) !== JSON.stringify(updatedValue)) {
        changes.before[key] = originalValue;
        changes.after[key] = updatedValue;
        changes.fields.push(key);
      }
    }

    return changes;
  }

  /**
   * Get audit summary for dashboard
   */
  static async getAuditSummary(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const pipeline = [
        {
          $match: {
            timestamp: { $gte: startDate }
          }
        },
        {
          $facet: {
            totalActions: [
              { $count: "count" }
            ],
            actionsByType: [
              {
                $group: {
                  _id: '$action',
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } }
            ],
            userActivity: [
              {
                $group: {
                  _id: '$userId',
                  userEmail: { $first: '$userEmail' },
                  userRole: { $first: '$userRole' },
                  actions: { $sum: 1 },
                  lastAction: { $max: '$timestamp' }
                }
              },
              { $sort: { actions: -1 } },
              { $limit: 10 }
            ],
            criticalEvents: [
              {
                $match: {
                  'metadata.urgencyLevel': 'critical'
                }
              },
              {
                $project: {
                  action: 1,
                  entityType: 1,
                  entityName: 1,
                  description: 1,
                  timestamp: 1,
                  userEmail: 1
                }
              },
              { $sort: { timestamp: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ];

      const result = await AuditTrail.aggregate(pipeline);
      return result[0];
    } catch (error) {
      console.error('Audit summary failed:', error);
      return null;
    }
  }
}

module.exports = AuditMiddleware;