const express = require('express');
const router = express.Router();
const incomeCategoryController = require('../controllers/incomeCategoryController');
const { verifyToken } = require('../middleware/authJwt');

// Apply auth middleware to all income category routes
router.use(verifyToken);

// POST /api/income-categories - Create a new income category
router.post('/', incomeCategoryController.createIncomeCategory);

// GET /api/income-categories - Get all income categories
router.get('/', incomeCategoryController.getAllIncomeCategories);

// GET /api/income-categories/:id - Get a single income category by ID
router.get('/:id', incomeCategoryController.getIncomeCategoryById);

// PUT /api/income-categories/:id - Update an existing income category
router.put('/:id', incomeCategoryController.updateIncomeCategory);

// DELETE /api/income-categories/:id - Delete an income category
router.delete('/:id', incomeCategoryController.deleteIncomeCategory);

module.exports = router;
