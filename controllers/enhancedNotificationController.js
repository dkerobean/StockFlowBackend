// controllers/enhancedNotificationController.js
const asyncHandler = require('express-async-handler');
const enhancedNotificationService = require('../services/enhancedNotificationService');
const Notification = require('../models/Notification');

// @desc    Get user notifications with filtering and pagination
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    type,
    isRead,
    priority,
    location
  } = req.query;

  try {
    const notifications = await enhancedNotificationService.getUserNotifications(
      req.user.id,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        priority,
        location
      }
    );

    const totalCount = await enhancedNotificationService.getUserUnreadCount(req.user.id);

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: notifications.length,
        hasMore: notifications.length === parseInt(limit)
      },
      unreadCount: totalCount
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to fetch notifications: ${error.message}`);
  }
});

// @desc    Get unread notification count for user
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
  try {
    const count = await enhancedNotificationService.getUserUnreadCount(req.user.id);
    
    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to get unread count: ${error.message}`);
  }
});

// @desc    Mark notification as read
// @route   POST /api/notifications/:id/mark-read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const notification = await enhancedNotificationService.markAsRead(id, req.user.id);
    
    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    res.status(404);
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
});

// @desc    Mark all notifications as read for user
// @route   POST /api/notifications/mark-all-read
// @access  Private
const markAllAsRead = asyncHandler(async (req, res) => {
  try {
    const result = await enhancedNotificationService.markAllAsRead(req.user.id);
    
    res.json({
      success: true,
      message: `Marked ${result.count} notifications as read`,
      data: result
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }
});

// @desc    Get notification by ID
// @route   GET /api/notifications/:id
// @access  Private
const getNotificationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const notification = await Notification.findById(id)
      .populate('data.productId data.locationId data.userId', 'name')
      .populate('createdBy', 'name email');

    if (!notification) {
      res.status(404);
      throw new Error('Notification not found');
    }

    // Check if user can see this notification
    if (!notification.canUserSee(req.user)) {
      res.status(403);
      throw new Error('Access denied to this notification');
    }

    // Check if user has read this notification
    const targetUser = notification.targetUsers?.find(
      tu => tu.user.toString() === req.user.id.toString()
    );

    const enrichedNotification = {
      ...notification.toObject(),
      isRead: targetUser?.isRead || false,
      readAt: targetUser?.readAt || null
    };

    res.json({
      success: true,
      data: enrichedNotification
    });
  } catch (error) {
    if (error.message === 'Notification not found' || error.message === 'Access denied to this notification') {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to fetch notification: ${error.message}`);
  }
});

// @desc    Manual trigger for low stock check (Admin only)
// @route   POST /api/notifications/check-low-stock
// @access  Admin
const manualLowStockCheck = asyncHandler(async (req, res) => {
  try {
    await enhancedNotificationService.checkLowStock();
    
    res.json({
      success: true,
      message: 'Low stock check completed successfully'
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Low stock check failed: ${error.message}`);
  }
});

// @desc    Manual trigger for expiry check (Admin only)
// @route   POST /api/notifications/check-expiring
// @access  Admin
const manualExpiryCheck = asyncHandler(async (req, res) => {
  try {
    await enhancedNotificationService.checkExpiringProducts();
    
    res.json({
      success: true,
      message: 'Expiry check completed successfully'
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Expiry check failed: ${error.message}`);
  }
});

// @desc    Create system alert (Admin only)
// @route   POST /api/notifications/system-alert
// @access  Admin
const createSystemAlert = asyncHandler(async (req, res) => {
  const { title, message, priority = 'medium', targetRoles = ['admin'] } = req.body;

  if (!title || !message) {
    res.status(400);
    throw new Error('Title and message are required');
  }

  try {
    const notification = await enhancedNotificationService.createSystemAlert(
      title,
      message,
      priority,
      targetRoles
    );
    
    res.status(201).json({
      success: true,
      message: 'System alert created successfully',
      data: notification
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to create system alert: ${error.message}`);
  }
});

// @desc    Get notification statistics (Admin only)
// @route   GET /api/notifications/stats
// @access  Admin
const getNotificationStats = asyncHandler(async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Aggregate notification statistics
    const stats = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          priorities: { $push: '$priority' }
        }
      },
      {
        $project: {
          type: '$_id',
          count: 1,
          highPriorityCount: {
            $size: {
              $filter: {
                input: '$priorities',
                cond: { $in: ['$$this', ['high', 'critical']] }
              }
            }
          }
        }
      }
    ]);

    // Get total counts
    const totalNotifications = await Notification.countDocuments({
      createdAt: { $gte: startDate }
    });

    const totalUnread = await Notification.countDocuments({
      createdAt: { $gte: startDate },
      'targetUsers.isRead': false
    });

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        totalNotifications,
        totalUnread,
        byType: stats,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to fetch notification statistics: ${error.message}`);
  }
});

// @desc    Delete notification (Admin only)
// @route   DELETE /api/notifications/:id
// @access  Admin
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const notification = await Notification.findById(id);
    
    if (!notification) {
      res.status(404);
      throw new Error('Notification not found');
    }

    await Notification.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    if (error.message === 'Notification not found') {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to delete notification: ${error.message}`);
  }
});

// @desc    Bulk delete notifications (Admin only)
// @route   DELETE /api/notifications/bulk
// @access  Admin
const bulkDeleteNotifications = asyncHandler(async (req, res) => {
  const { notificationIds, olderThan } = req.body;

  try {
    let deleteQuery = {};

    if (notificationIds && Array.isArray(notificationIds)) {
      deleteQuery._id = { $in: notificationIds };
    } else if (olderThan) {
      const cutoffDate = new Date(olderThan);
      deleteQuery.createdAt = { $lt: cutoffDate };
    } else {
      res.status(400);
      throw new Error('Either notificationIds or olderThan date is required');
    }

    const result = await Notification.deleteMany(deleteQuery);
    
    res.json({
      success: true,
      message: `${result.deletedCount} notifications deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    if (error.message.includes('required')) {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to delete notifications: ${error.message}`);
  }
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getNotificationById,
  manualLowStockCheck,
  manualExpiryCheck,
  createSystemAlert,
  getNotificationStats,
  deleteNotification,
  bulkDeleteNotifications
};