const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Sale = require('../models/Sale');

// @desc    Create invoice from sale
// @route   POST /api/invoices
// @access  Private
const createInvoice = asyncHandler(async (req, res) => {
    const { saleId } = req.body;

    const sale = await Sale.findById(saleId)
        .populate('items.product')
        .populate('location')
        .populate('createdBy');

    if (!sale) {
        res.status(404);
        throw new Error('Sale not found');
    }

    // Create invoice from sale data
    const invoice = new Invoice({
        sale: sale._id,
        customer: sale.customer,
        items: sale.items.map(item => ({
            product: item.product._id,
            name: item.product.name,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            total: item.price * item.quantity * (1 - item.discount / 100)
        })),
        subtotal: sale.subtotal,
        tax: sale.tax,
        discount: sale.discount,
        total: sale.total,
        status: 'Paid', // Default to Paid since it's a completed sale
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        paymentMethod: sale.paymentMethod,
        location: sale.location._id,
        createdBy: sale.createdBy._id,
        notes: sale.notes
    });

    const createdInvoice = await invoice.save();

    res.status(201).json(createdInvoice);
});

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
const getInvoices = asyncHandler(async (req, res) => {
    const { startDate, endDate, status, locationId } = req.query;
    const filter = {};

    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (status) {
        filter.status = status;
    }

    if (locationId) {
        filter.location = locationId;
    }

    const invoices = await Invoice.find(filter)
        .populate('sale')
        .populate('location', 'name')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 });

    res.json(invoices);
});

// @desc    Get invoice by ID
// @route   GET /api/invoices/:id
// @access  Private
const getInvoice = asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.id)
        .populate('sale')
        .populate('location', 'name')
        .populate('createdBy', 'name')
        .populate('items.product');

    if (!invoice) {
        res.status(404);
        throw new Error('Invoice not found');
    }

    res.json(invoice);
});

// @desc    Update invoice status
// @route   PUT /api/invoices/:id
// @access  Private
const updateInvoiceStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
        res.status(404);
        throw new Error('Invoice not found');
    }

    invoice.status = status;
    const updatedInvoice = await invoice.save();

    res.json(updatedInvoice);
});

module.exports = {
    createInvoice,
    getInvoices,
    getInvoice,
    updateInvoiceStatus
};