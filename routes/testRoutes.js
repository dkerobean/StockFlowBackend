const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// Test routes for triggering real-time events
router.post('/trigger-sale', testController.triggerTestSale);
router.post('/trigger-inventory', testController.triggerTestInventoryUpdate);
router.post('/trigger-alert', testController.triggerCriticalAlert);
router.post('/trigger-product', testController.triggerProductUpdate);
router.get('/connected-clients', testController.getConnectedClients);

module.exports = router;