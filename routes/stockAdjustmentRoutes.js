// routes/stockAdjustmentRoutes.js
const express = require('express');
const router = express.Router();
const {
    createStockAdjustment,
    getStockAdjustments,
    getStockAdjustmentById,
    updateStockAdjustment,
    deleteStockAdjustment
} = require('../controllers/stockAdjustmentController');

// --- Import your actual middleware functions ---
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt');
// Assuming hasLocationAccess check is done inside controllers where location context is clearer
// --- End Import ---

// Apply verifyToken middleware to all routes in this file
router.use(verifyToken); // Replaces 'protect'

// Routes
router.route('/')
    // User must be Manager or Admin to POST or GET list
    .post(isManagerOrAdmin, createStockAdjustment)   // Replaces 'manager'
    .get(isManagerOrAdmin, getStockAdjustments);     // Replaces 'manager'

router.route('/:id')
    // User must be Manager or Admin to GET by ID or PUT update
    .get(isManagerOrAdmin, getStockAdjustmentById)    // Replaces 'manager'
    .put(isManagerOrAdmin, updateStockAdjustment)     // Replaces 'manager'
    // User must be Manager or Admin to DELETE (as per new requirement)
    .delete(isManagerOrAdmin, deleteStockAdjustment); // Replaces 'admin' with 'isManagerOrAdmin'

module.exports = router;