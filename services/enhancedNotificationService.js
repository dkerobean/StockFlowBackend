// services/enhancedNotificationService.js
const Notification = require('../models/Notification');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendLowStockEmail } = require('./emailService');
const { 
  getIO, 
  emitNotificationByTarget,
  emitNotificationCountUpdate,
  emitNotificationRead
} = require('../socket');

class EnhancedNotificationService {
  constructor() {
    this.io = null;
  }

  // Initialize with socket.io instance
  init(io) {
    this.io = io;
  }

  // Get socket.io instance
  getSocket() {
    if (!this.io) {
      this.io = getIO();
    }
    return this.io;
  }

  // Create and emit low stock notification
  async createLowStockNotification(inventoryItem) {
    try {
      const product = await Product.findById(inventoryItem.product).populate('category');
      const location = await inventoryItem.populate('location');
      
      const notification = await Notification.createRoleNotification({
        type: 'low_stock',
        title: 'Low Stock Alert',
        message: `${product.name} is running low at ${location.location.name}`,
        data: {
          productId: product._id,
          inventoryId: inventoryItem._id,
          locationId: inventoryItem.location,
          quantity: inventoryItem.quantity,
          threshold: inventoryItem.notifyAt
        },
        priority: 'high',
        targetLocations: [inventoryItem.location]
      }, ['admin', 'manager']);

      // Emit real-time notification using enhanced targeting
      emitNotificationByTarget({
        ...notification.toObject(),
        data: {
          ...notification.data,
          productName: product.name,
          locationName: location.location.name
        }
      });

      // Send email to admins
      const admins = await User.find({ role: 'admin' });
      await sendLowStockEmail(product, admins);

      console.log(`Low stock notification created for ${product.name} at ${location.location.name}`);
      return notification;
    } catch (error) {
      console.error('Error creating low stock notification:', error);
      throw error;
    }
  }

  // Create and emit out of stock notification
  async createOutOfStockNotification(inventoryItem) {
    try {
      const product = await Product.findById(inventoryItem.product).populate('category');
      const location = await inventoryItem.populate('location');
      
      const notification = await Notification.createRoleNotification({
        type: 'out_of_stock',
        title: 'Out of Stock Alert',
        message: `${product.name} is out of stock at ${location.location.name}`,
        data: {
          productId: product._id,
          inventoryId: inventoryItem._id,
          locationId: inventoryItem.location,
          quantity: 0
        },
        priority: 'critical',
        targetLocations: [inventoryItem.location]
      }, ['admin', 'manager']);

      // Emit real-time notification using enhanced targeting
      emitNotificationByTarget({
        ...notification.toObject(),
        data: {
          ...notification.data,
          productName: product.name,
          locationName: location.location.name
        }
      });

      console.log(`Out of stock notification created for ${product.name} at ${location.location.name}`);
      return notification;
    } catch (error) {
      console.error('Error creating out of stock notification:', error);
      throw error;
    }
  }

  // Create stock adjustment notification
  async createStockAdjustmentNotification(inventoryItem, adjustment, user, reason) {
    try {
      const product = await Product.findById(inventoryItem.product);
      const location = await inventoryItem.populate('location');
      
      const adjustmentType = adjustment > 0 ? 'increased' : 'decreased';
      const notification = await Notification.createRoleNotification({
        type: 'stock_adjustment',
        title: 'Stock Adjustment',
        message: `${user.name} ${adjustmentType} stock for ${product.name} at ${location.location.name}`,
        data: {
          productId: product._id,
          inventoryId: inventoryItem._id,
          locationId: inventoryItem.location,
          quantity: inventoryItem.quantity,
          adjustment: adjustment,
          userId: user._id,
          reason: reason
        },
        priority: Math.abs(adjustment) > 100 ? 'high' : 'medium',
        targetLocations: [inventoryItem.location],
        createdBy: user._id
      }, ['admin', 'manager']);

      // Emit real-time notification
      const io = this.getSocket();
      io.emit('notification', {
        type: 'stock_adjustment',
        notification: notification,
        data: {
          productName: product.name,
          locationName: location.location.name,
          userName: user.name,
          adjustment: adjustment,
          newQuantity: inventoryItem.quantity
        }
      });

      return notification;
    } catch (error) {
      console.error('Error creating stock adjustment notification:', error);
      throw error;
    }
  }

  // Create sale completion notification
  async createSaleNotification(sale) {
    try {
      const notification = await Notification.createRoleNotification({
        type: 'sale_completed',
        title: 'Sale Completed',
        message: `New sale completed - Total: $${sale.total}`,
        data: {
          saleId: sale._id,
          amount: sale.total,
          customerName: sale.customer?.name || 'Walk-in Customer',
          itemCount: sale.items?.length || 0
        },
        priority: sale.total > 1000 ? 'high' : 'medium'
      }, ['admin', 'manager']);

      // Emit real-time notification for large sales
      if (sale.total > 500) {
        const io = this.getSocket();
        io.emit('notification', {
          type: 'sale_completed',
          notification: notification,
          data: {
            amount: sale.total,
            customerName: sale.customer?.name || 'Walk-in Customer'
          }
        });
      }

      return notification;
    } catch (error) {
      console.error('Error creating sale notification:', error);
      throw error;
    }
  }

  // Create expiry warning notification
  async createExpiryWarningNotification(inventoryItem, daysUntilExpiry) {
    try {
      const product = await Product.findById(inventoryItem.product);
      const location = await inventoryItem.populate('location');
      
      const notification = await Notification.createRoleNotification({
        type: 'expiry_warning',
        title: 'Product Expiry Warning',
        message: `${product.name} expires in ${daysUntilExpiry} days at ${location.location.name}`,
        data: {
          productId: product._id,
          inventoryId: inventoryItem._id,
          locationId: inventoryItem.location,
          expiryDate: inventoryItem.expiryDate,
          daysUntilExpiry: daysUntilExpiry
        },
        priority: daysUntilExpiry <= 3 ? 'high' : 'medium',
        targetLocations: [inventoryItem.location]
      }, ['admin', 'manager']);

      // Emit real-time notification for urgent expiries
      if (daysUntilExpiry <= 7) {
        const io = this.getSocket();
        io.emit('notification', {
          type: 'expiry_warning',
          notification: notification,
          data: {
            productName: product.name,
            locationName: location.location.name,
            daysUntilExpiry: daysUntilExpiry
          }
        });
      }

      return notification;
    } catch (error) {
      console.error('Error creating expiry warning notification:', error);
      throw error;
    }
  }

  // Create transfer completion notification
  async createTransferNotification(transfer) {
    try {
      const fromLocation = await transfer.populate('fromLocation');
      const toLocation = await transfer.populate('toLocation');
      
      const notification = await Notification.createRoleNotification({
        type: 'transfer_completed',
        title: 'Stock Transfer Completed',
        message: `Stock transfer completed from ${fromLocation.fromLocation.name} to ${toLocation.toLocation.name}`,
        data: {
          transferId: transfer._id,
          fromLocationId: transfer.fromLocation,
          toLocationId: transfer.toLocation,
          itemCount: transfer.items?.length || 0
        },
        priority: 'medium',
        targetLocations: [transfer.fromLocation, transfer.toLocation]
      }, ['admin', 'manager']);

      // Emit real-time notification
      const io = this.getSocket();
      io.emit('notification', {
        type: 'transfer_completed',
        notification: notification,
        data: {
          fromLocationName: fromLocation.fromLocation.name,
          toLocationName: toLocation.toLocation.name,
          itemCount: transfer.items?.length || 0
        }
      });

      return notification;
    } catch (error) {
      console.error('Error creating transfer notification:', error);
      throw error;
    }
  }

  // Create system alert notification
  async createSystemAlert(title, message, priority = 'medium', targetRoles = ['admin']) {
    try {
      const notification = await Notification.createRoleNotification({
        type: 'system_alert',
        title: title,
        message: message,
        priority: priority,
        isGlobal: targetRoles.includes('admin') && targetRoles.includes('manager') && targetRoles.includes('staff')
      }, targetRoles);

      // Emit real-time notification for high priority alerts
      if (priority === 'high' || priority === 'critical') {
        const io = this.getSocket();
        io.emit('notification', {
          type: 'system_alert',
          notification: notification,
          data: {
            title: title,
            message: message,
            priority: priority
          }
        });
      }

      return notification;
    } catch (error) {
      console.error('Error creating system alert:', error);
      throw error;
    }
  }

  // Comprehensive low stock check (enhanced version)
  async checkLowStock() {
    try {
      console.log('🔍 Starting comprehensive low stock check...');
      
      // Find low stock items that haven't been notified recently
      const lowStockItems = await Inventory.find({
        $expr: { $lte: ["$quantity", "$notifyAt"] },
        quantity: { $gt: 0 }, // Not out of stock
        $or: [
          { lastNotified: { $exists: false } },
          { lastNotified: { $lt: new Date(Date.now() - 4 * 60 * 60 * 1000) } } // 4 hours ago
        ]
      }).populate('product location');

      console.log(`Found ${lowStockItems.length} low stock items`);

      for (const item of lowStockItems) {
        await this.createLowStockNotification(item);
        
        // Update last notified timestamp
        item.lastNotified = new Date();
        await item.save();
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check for out of stock items
      await this.checkOutOfStock();

      console.log(`✅ Low stock check completed. Processed ${lowStockItems.length} notifications.`);
    } catch (error) {
      console.error('❌ Low stock check failed:', error);
      throw error;
    }
  }

  // Check for out of stock items
  async checkOutOfStock() {
    try {
      const outOfStockItems = await Inventory.find({
        quantity: 0,
        $or: [
          { lastNotified: { $exists: false } },
          { lastNotified: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } // 24 hours ago
        ]
      }).populate('product location');

      for (const item of outOfStockItems) {
        await this.createOutOfStockNotification(item);
        
        // Update last notified timestamp
        item.lastNotified = new Date();
        await item.save();
      }

      console.log(`Processed ${outOfStockItems.length} out of stock notifications`);
    } catch (error) {
      console.error('Error checking out of stock items:', error);
      throw error;
    }
  }

  // Check for expiring products
  async checkExpiringProducts() {
    try {
      const warningDays = [30, 14, 7, 3, 1]; // Days before expiry to send warnings
      const now = new Date();

      for (const days of warningDays) {
        const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

        const expiringItems = await Inventory.find({
          expiryDate: {
            $gte: startOfDay,
            $lte: endOfDay
          },
          quantity: { $gt: 0 },
          $or: [
            { lastNotified: { $exists: false } },
            { lastNotified: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
          ]
        }).populate('product location');

        for (const item of expiringItems) {
          await this.createExpiryWarningNotification(item, days);
          
          item.lastNotified = new Date();
          await item.save();
        }

        console.log(`Processed ${expiringItems.length} expiry warnings for ${days} days`);
      }
    } catch (error) {
      console.error('Error checking expiring products:', error);
      throw error;
    }
  }

  // Get notifications for a user
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        isRead,
        priority,
        location
      } = options;

      const user = await User.findById(userId).populate('locations');
      if (!user) {
        throw new Error('User not found');
      }

      // Build query
      const query = {
        $or: [
          { isGlobal: true },
          { 'targetUsers.user': userId },
          { targetRoles: user.role }
        ]
      };

      // Add location filter if user has specific locations
      if (user.locations && user.locations.length > 0) {
        query.$or.push({ targetLocations: { $in: user.locations } });
      }

      // Apply filters
      if (type) query.type = type;
      if (priority) query.priority = priority;
      if (location) query.targetLocations = location;

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('data.productId data.locationId data.userId', 'name')
        .lean();

      // Filter based on user read status
      const enrichedNotifications = notifications.map(notification => {
        const targetUser = notification.targetUsers?.find(
          tu => tu.user.toString() === userId.toString()
        );
        
        return {
          ...notification,
          isRead: targetUser?.isRead || false,
          readAt: targetUser?.readAt || null
        };
      });

      // Apply read filter if specified
      const filteredNotifications = isRead !== undefined 
        ? enrichedNotifications.filter(n => n.isRead === isRead)
        : enrichedNotifications;

      return filteredNotifications;
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  // Get unread count for a user
  async getUserUnreadCount(userId) {
    try {
      const user = await User.findById(userId).populate('locations');
      if (!user) {
        throw new Error('User not found');
      }

      const query = {
        $or: [
          { isGlobal: true },
          { 
            targetUsers: {
              $elemMatch: {
                user: userId,
                isRead: false
              }
            }
          },
          { targetRoles: user.role }
        ]
      };

      // Add location filter if user has specific locations
      if (user.locations && user.locations.length > 0) {
        query.$or.push({ targetLocations: { $in: user.locations } });
      }

      const count = await Notification.countDocuments(query);
      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  // Mark notification as read for a user
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findById(notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.markAsReadForUser(userId);
      
      // Emit real-time update for notification read status
      emitNotificationRead(userId, notificationId);
      
      // Update unread count
      const newUnreadCount = await this.getUserUnreadCount(userId);
      emitNotificationCountUpdate(userId, newUnreadCount);
      
      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    try {
      const user = await User.findById(userId).populate('locations');
      if (!user) {
        throw new Error('User not found');
      }

      const query = {
        $or: [
          { isGlobal: true },
          { 'targetUsers.user': userId },
          { targetRoles: user.role }
        ]
      };

      if (user.locations && user.locations.length > 0) {
        query.$or.push({ targetLocations: { $in: user.locations } });
      }

      const notifications = await Notification.find(query);
      
      for (const notification of notifications) {
        await notification.markAsReadForUser(userId);
      }

      // Emit real-time update for unread count
      emitNotificationCountUpdate(userId, 0);

      return { success: true, count: notifications.length };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new EnhancedNotificationService();