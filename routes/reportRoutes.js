// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt'); // Assuming you have these role checks

// Protect all report routes
router.use(verifyToken);
// Apply role-based access control (adjust as needed)
// ManagerOrAdmin can access most reports, potentially some are Admin only if desired
router.use(isManagerOrAdmin);

// Define report endpoints
router.get('/stock-levels', reportController.getStockLevelReport);
router.get('/low-stock', reportController.getLowStockReport);
router.get('/sales-trends', reportController.getSalesTrendReport);
router.get('/sales', reportController.getSalesReport);
router.get('/income', reportController.getIncomeReport);
router.get('/expenses', reportController.getExpenseReport);
router.get('/profit-loss', reportController.getProfitLossReport);

module.exports = router;