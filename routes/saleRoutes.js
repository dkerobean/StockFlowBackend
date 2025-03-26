const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middleware/authJwt');
const { createSale, getSales, getSale } = require('../controllers/saleController');

// Create a sale
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'manager', 'staff']),
  createSale
);

// Get all sales
router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'manager']),
  getSales
);

// Get single sale
router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'manager', 'staff']),
  getSale
);

module.exports = router;