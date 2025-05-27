const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authJwt');
const supplierController = require('../controllers/supplierController');

// Create Supplier
router.post('/', verifyToken, supplierController.createSupplier);

// Get All Suppliers
router.get('/', verifyToken, supplierController.getSuppliers);

// Get Single Supplier
router.get('/:id', verifyToken, supplierController.getSupplierById);

// Update Supplier
router.put('/:id', verifyToken, supplierController.updateSupplier);

// Delete Supplier
router.delete('/:id', verifyToken, supplierController.deleteSupplier);

module.exports = router;