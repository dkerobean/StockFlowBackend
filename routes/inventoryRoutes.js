const express = require('express');
const router = express.Router();
const { verifyToken, isManagerOrAdmin, hasLocationAccess } = require('../middleware/authJwt');
const inventoryController = require('../controllers/inventoryController');

// Add Inventory Record (explicitly add product to location)
// User needs manager/admin role AND access to the specific locationId in the body
router.post('/', verifyToken, isManagerOrAdmin, hasLocationAccess('locationId'), inventoryController.addInventoryRecord); // hasLocationAccess checks req.body.locationId

// Get Inventory List (filtered by user access)
router.get('/', verifyToken, inventoryController.getInventory);

// Get Single Inventory Record by ID (checks location access internally)
router.get('/:id', verifyToken, inventoryController.getInventoryById);

// Adjust Stock for specific inventory ID
// User needs manager/admin role AND access to the location associated with inventory :id
router.patch('/:id/adjust', verifyToken, isManagerOrAdmin, inventoryController.adjustInventory); // Controller handles internal location check based on :id

module.exports = router;