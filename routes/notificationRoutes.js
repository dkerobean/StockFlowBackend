const express = require('express');
const router = express.Router();
const {
  manualLowStockCheck,
  updateNotificationSettings
} = require('../controllers/notificationController');
const { verifyToken, checkRole } = require('../middleware/authJwt');

router.get('/notifications/low-stock-check',
  verifyToken,
  checkRole(['admin']),
  manualLowStockCheck
);

router.patch('/products/:productId/notification-settings',
  verifyToken,
  checkRole(['admin', 'manager']),
  updateNotificationSettings
);

module.exports = router;