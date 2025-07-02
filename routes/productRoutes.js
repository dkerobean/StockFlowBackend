const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  permanentDeleteProduct,
  reactivateProduct,
  getProducts,
  getProductById
} = require('../controllers/productController');

// Use isManagerOrAdmin for creation and update
router.post('/', verifyToken, isManagerOrAdmin, createProduct);
router.put('/:id', verifyToken, isManagerOrAdmin, updateProduct);

// Use isAdmin for the soft delete operation
router.delete('/:id', verifyToken, isAdmin, deleteProduct);

// Use isAdmin for permanent delete operation (more restrictive)
router.delete('/:id/permanent', verifyToken, isAdmin, permanentDeleteProduct);

// Use isManagerOrAdmin for reactivation
router.patch('/:id/reactivate', verifyToken, isManagerOrAdmin, reactivateProduct);

// Any authenticated user can get product definitions
router.get('/', verifyToken, getProducts);

// GET /api/products/:id
router.get('/:id', verifyToken, getProductById);


module.exports = router;