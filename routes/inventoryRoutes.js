const express = require('express');
const router = express.Router();
const { verifyToken, isManagerOrAdmin, hasLocationAccess } = require('../middleware/authJwt');
const inventoryController = require('../controllers/inventoryController');

// --- Define SPECIFIC string routes FIRST ---

// GET Expired Inventory List
router.get('/expired', verifyToken, inventoryController.getExpiredInventory);

// GET Low Stock Inventory List
router.get('/low-stock', verifyToken, inventoryController.getLowStockInventory);

// GET Out of Stock Inventory List
router.get('/out-of-stock', verifyToken, inventoryController.getOutOfStockInventory);


// --- Define General/Parameterized routes AFTER specific ones ---

// Add Inventory Record (explicitly add product to location)
// User needs manager/admin role AND access to the specific locationId in the body
router.post('/', verifyToken, isManagerOrAdmin, hasLocationAccess('locationId'), inventoryController.addInventoryRecord); // hasLocationAccess checks req.body.locationId

// Get Inventory List (filtered by user access)
// NOTE: This should usually come AFTER specific GETs but BEFORE /:id if its path is just '/'
router.get('/', verifyToken, inventoryController.getInventory);

// Adjust Stock for specific inventory ID
// Needs to come before /:id GET if you structure routes like router.route('/:id').get().patch()
// Or define separately as done here. The order between PATCH :id/adjust and GET :id usually doesn't matter
// unless using router.route().
router.patch('/:id/adjust', verifyToken, isManagerOrAdmin, inventoryController.adjustInventory); // Controller handles internal location check based on :id

// Get Single Inventory Record by ID (checks location access internally)
// This parameterized route MUST come AFTER specific string routes like /expired
router.get('/:id', verifyToken, inventoryController.getInventoryById);


module.exports = router;