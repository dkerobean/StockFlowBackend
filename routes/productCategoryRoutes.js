const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt');
const ctrl = require('../controllers/productCategoryController');

// Create Category (any authenticated user)
router.post('/', verifyToken, ctrl.createCategory);

// Get Categories (any authenticated user)
router.get('/', verifyToken, ctrl.getCategories);

// Update Category (manager or admin)
router.put('/:id', verifyToken, isManagerOrAdmin, ctrl.updateCategory);

// Delete Category (admin only)
router.delete('/:id', verifyToken, isAdmin, ctrl.deleteCategory);

module.exports = router;