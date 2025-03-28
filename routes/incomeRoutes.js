const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');
const { verifyToken } = require('../middleware/authJwt');

router.use(verifyToken); // Apply auth to all routes

// POST /api/income - Record income
router.post('/', incomeController.recordIncome);

// GET /api/income - Get all income
router.get('/', incomeController.getAllIncome);

// GET /api/income/:id - Get single income
router.get('/:id', incomeController.getIncomeById);

// PUT /api/income/:id - Update income  <-- ADDED
router.put('/:id', incomeController.updateIncome);

// DELETE /api/income/:id - Delete income <-- ADDED
router.delete('/:id', incomeController.deleteIncome);

module.exports = router;