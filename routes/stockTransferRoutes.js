const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin, hasLocationAccess } = require('../middleware/authJwt');
const stockTransferController = require('../controllers/stockTransferController');

// Create Transfer Request (Requires access to FROM location)
router.post('/', verifyToken, isManagerOrAdmin, hasLocationAccess('fromLocationId'), stockTransferController.createTransfer); // Checks req.body.fromLocationId

// Get Transfers List (Filtered based on user's location access)
router.get('/', verifyToken, stockTransferController.getTransfers);

// Get Single Transfer (Requires access to EITHER location)
router.get('/:id', verifyToken, stockTransferController.getTransferById); // Controller checks access internally

// Ship Transfer (Requires access to FROM location)
router.patch('/:id/ship', verifyToken, isManagerOrAdmin, stockTransferController.shipTransfer); // Controller checks access internally based on transfer's fromLocation

// Receive Transfer (Requires access to TO location)
router.patch('/:id/receive', verifyToken, isManagerOrAdmin, stockTransferController.receiveTransfer); // Controller checks access internally based on transfer's toLocation

// Cancel Transfer (Requires access to EITHER location or be requester)
router.patch('/:id/cancel', verifyToken, isManagerOrAdmin, stockTransferController.cancelTransfer); // Controller checks access internally

module.exports = router;