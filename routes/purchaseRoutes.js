const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt');
const purchaseController = require('../controllers/purchaseController');

// Get purchase statistics
router.get('/stats', verifyToken, purchaseController.getPurchaseStats);

// Get purchase report data
router.get('/report', verifyToken, purchaseController.getPurchaseReport);

// Create purchase
router.post('/', verifyToken, purchaseController.createPurchase);

// Get all purchases
router.get('/', verifyToken, purchaseController.getPurchases);

// Get single purchase
router.get('/:id', verifyToken, purchaseController.getPurchaseById);

// Update purchase
router.put('/:id', verifyToken, isManagerOrAdmin, purchaseController.updatePurchase);

// Receive purchase (update inventory)
router.post('/:id/receive', verifyToken, isManagerOrAdmin, purchaseController.receivePurchase);

// Record payment for purchase
router.post('/:id/payment', verifyToken, isManagerOrAdmin, purchaseController.recordPayment);

// Delete purchase (soft delete)
router.delete('/:id', verifyToken, isAdmin, purchaseController.deletePurchase);

module.exports = router;