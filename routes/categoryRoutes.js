const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt'); // Adjust path if needed
const categoryController = require('../controllers/categoryController'); // Adjust path if needed

// Create Category
router.post('/', verifyToken, isManagerOrAdmin, categoryController.createCategory);

// Get all Categories
router.get('/', verifyToken, categoryController.getCategories);

// Get single Category
router.get('/:id', verifyToken, categoryController.getCategoryById);

// Update Category
router.put('/:id', verifyToken, isManagerOrAdmin, categoryController.updateCategory);

// Delete Category
router.delete('/:id', verifyToken, isAdmin, categoryController.deleteCategory);

module.exports = router;