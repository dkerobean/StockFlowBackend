const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authJwt');
const customerController = require('../controllers/customerController');

// Get Customer Statistics
router.get('/stats', verifyToken, customerController.getCustomerStats);

// Create Customer
router.post('/', verifyToken, customerController.createCustomer);

// Get All Customers
router.get('/', verifyToken, customerController.getCustomers);

// Get Single Customer
router.get('/:id', verifyToken, customerController.getCustomerById);

// Update Customer
router.put('/:id', verifyToken, customerController.updateCustomer);

// Delete Customer
router.delete('/:id', verifyToken, customerController.deleteCustomer);

module.exports = router;