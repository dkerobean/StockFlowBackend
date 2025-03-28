const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { verifyToken } = require('../middleware/authJwt');

router.use(verifyToken); // Apply auth to all routes

// POST /api/expense - Record expense
router.post('/', expenseController.recordExpense);

// GET /api/expense - Get all expenses
router.get('/', expenseController.getAllExpenses);

// GET /api/expense/:id - Get single expense
router.get('/:id', expenseController.getExpenseById);

// PUT /api/expense/:id - Update expense <-- ADDED
router.put('/:id', expenseController.updateExpense);

// DELETE /api/expense/:id - Delete expense <-- ADDED
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;