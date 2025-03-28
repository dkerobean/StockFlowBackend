const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { verifyToken } = require('../middleware/authJwt'); // Import authentication middleware

// Apply verifyToken middleware to all routes in this file
router.use(verifyToken);

// Route to record a new expense
// POST /api/expense
router.post('/', expenseController.recordExpense);

// Route to get all expense records
// GET /api/expense
router.get('/', expenseController.getAllExpenses);

// Route to get a single expense record by ID
// GET /api/expense/:id
router.get('/:id', expenseController.getExpenseById);

// Add routes for PUT (update) and DELETE as needed

module.exports = router;