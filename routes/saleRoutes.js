const express = require('express');
const router = express.Router();
// Use specific role checks and location access check
const { verifyToken, isAdmin, isManagerOrAdmin, hasLocationAccess, checkRole } = require('../middleware/authJwt');
const { createSale, getSales, getSale } = require('../controllers/saleController');

// Create a sale (Requires Staff+ role and access to the location specified in body)
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'manager', 'staff']), // Allow staff to create sales
  hasLocationAccess('locationId'), // Check access to req.body.locationId
  createSale
);

// Get all sales (Requires Manager+ role, filtered by location access)
router.get(
  '/',
  verifyToken,
  isManagerOrAdmin, // Only managers/admins can see list view
  getSales // Controller handles filtering by user's locations
);

// Get single sale (Requires Staff+ role and access to the sale's location)
router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'manager', 'staff']), // Allow staff to view sales they might have made
  getSale // Controller handles location access check internally
);

module.exports = router;