const express = require('express');
const router = express.Router();
const {
    createInvoice,
    getInvoices,
    getInvoice,
    updateInvoiceStatus
} = require('../controllers/invoiceController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, createInvoice)
    .get(protect, getInvoices);

router.route('/:id')
    .get(protect, getInvoice)
    .put(protect, updateInvoiceStatus);

module.exports = router;