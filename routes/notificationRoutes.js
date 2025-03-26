// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middleware/authJwt');
const {
  checkLowStock,
  updateNotifyThreshold
} = require('../controllers/notificationController');

// Manual trigger for low stock check
router.get(
  '/check-low-stock',
  verifyToken,
  checkRole(['admin']),
  checkLowStock
);

// Update notification threshold
router.patch(
  '/products/:id/notify-at',
  verifyToken,
  checkRole(['admin', 'manager']),
  updateNotifyThreshold
);

module.exports = router;