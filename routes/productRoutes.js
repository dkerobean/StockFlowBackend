const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
} = require('../controllers/productController');

// Use isManagerOrAdmin for creation and update
router.post('/', verifyToken, isManagerOrAdmin, createProduct);
router.put('/:id', verifyToken, isManagerOrAdmin, updateProduct);

// Use isAdmin for the soft delete operation
router.delete('/:id', verifyToken, isAdmin, deleteProduct);

// Any authenticated user can get product definitions
router.get('/', verifyToken, getProducts);


module.exports = router;