const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');
const { verifyToken } = require('../middleware/authJwt'); // Import authentication middleware

// Apply verifyToken middleware to all routes in this file
router.use(verifyToken);

// Route to record a new income
// POST /api/income
router.post('/', incomeController.recordIncome);

// Route to get all income records
// GET /api/income
router.get('/', incomeController.getAllIncome);

// Route to get a single income record by ID
// GET /api/income/:id
router.get('/:id', incomeController.getIncomeById);

// Add routes for PUT (update) and DELETE as needed

module.exports = router;