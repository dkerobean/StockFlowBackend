const express = require('express');
const router = express.Router();
const posController = require('../controllers/posController');
const { authenticate, authorize } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticate);

// Create a new POS sale
router.post('/', authorize(['admin', 'cashier']), posController.createPOS);

// Get all POS sales
router.get('/', authorize(['admin', 'manager', 'cashier']), posController.getAllPOS);

// Get POS statistics
router.get('/stats', authorize(['admin', 'manager']), posController.getPOSStats);

// Get a single POS sale
router.get('/:id', authorize(['admin', 'manager', 'cashier']), posController.getPOS);

// Update POS sale status
router.patch('/:id/status', authorize(['admin', 'manager']), posController.updatePOSStatus);

module.exports = router;