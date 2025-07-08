// routes/enhancedNotificationRoutes.js
const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/enhancedNotificationController');
const { verifyToken, checkRole } = require('../middleware/authJwt');

// @route   GET /api/notifications
// @desc    Get user notifications with filtering and pagination
// @access  Private
router.get('/', verifyToken, getNotifications);

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count for user
// @access  Private
router.get('/unread-count', verifyToken, getUnreadCount);

// @route   POST /api/notifications/mark-all-read
// @desc    Mark all notifications as read for user
// @access  Private
router.post('/mark-all-read', verifyToken, markAllAsRead);

// @route   GET /api/notifications/stats
// @desc    Get notification statistics (Admin only)
// @access  Admin
router.get('/stats', verifyToken, checkRole(['admin']), getNotificationStats);

// @route   POST /api/notifications/check-low-stock
// @desc    Manual trigger for low stock check (Admin only)
// @access  Admin
router.post('/check-low-stock', verifyToken, checkRole(['admin']), manualLowStockCheck);

// @route   POST /api/notifications/check-expiring
// @desc    Manual trigger for expiry check (Admin only)
// @access  Admin
router.post('/check-expiring', verifyToken, checkRole(['admin']), manualExpiryCheck);

// @route   POST /api/notifications/system-alert
// @desc    Create system alert (Admin only)
// @access  Admin
router.post('/system-alert', verifyToken, checkRole(['admin']), createSystemAlert);

// @route   DELETE /api/notifications/bulk
// @desc    Bulk delete notifications (Admin only)
// @access  Admin
router.delete('/bulk', verifyToken, checkRole(['admin']), bulkDeleteNotifications);

// @route   GET /api/notifications/:id
// @desc    Get notification by ID
// @access  Private
router.get('/:id', verifyToken, getNotificationById);

// @route   POST /api/notifications/:id/mark-read
// @desc    Mark notification as read
// @access  Private
router.post('/:id/mark-read', verifyToken, markAsRead);

// @route   DELETE /api/notifications/:id
// @desc    Delete notification (Admin only)
// @access  Admin
router.delete('/:id', verifyToken, checkRole(['admin']), deleteNotification);

module.exports = router;