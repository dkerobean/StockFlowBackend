const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middleware/authJwt');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  adjustStock
} = require('../controllers/productController');

router.post('/', verifyToken, checkRole(['admin', 'manager']), createProduct);
router.put('/:id', verifyToken, checkRole(['admin', 'manager']), updateProduct);
router.delete('/:id', verifyToken, checkRole(['admin']), deleteProduct);
router.get('/', verifyToken, getProducts);
router.patch('/:id/stock', verifyToken, checkRole(['admin', 'manager']), adjustStock);

module.exports = router;