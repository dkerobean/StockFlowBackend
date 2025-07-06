const express = require('express');
const router = express.Router();
const { verifyToken, isManagerOrAdmin } = require('../middleware/authJwt');
const AuditMiddleware = require('../middleware/auditMiddleware');
const analyticsController = require('../controllers/analyticsController');

// Apply audit context middleware to all routes
router.use(verifyToken);
router.use(AuditMiddleware.captureUserContext());

// Dashboard analytics - comprehensive overview
router.get('/dashboard', isManagerOrAdmin, analyticsController.getDashboardAnalytics);

// Inventory analytics with filtering
router.get('/inventory', analyticsController.getInventoryAnalytics);

// Purchase receiving analytics
router.get('/purchases', analyticsController.getPurchaseAnalytics);

// Optimization recommendations
router.get('/optimization', isManagerOrAdmin, analyticsController.getOptimizationRecommendations);

// Real-time alerts and notifications
router.get('/alerts', analyticsController.getRealTimeAlerts);

// Audit trail analytics
router.get('/audit', isManagerOrAdmin, analyticsController.getAuditAnalytics);

// Export analytics data
router.get('/export', isManagerOrAdmin, analyticsController.exportAnalytics);

// Dashboard specific endpoints
router.get('/dashboard/admin', isManagerOrAdmin, analyticsController.getAdminDashboardStats);
router.get('/dashboard/sales', analyticsController.getSalesDashboardStats);

module.exports = router;