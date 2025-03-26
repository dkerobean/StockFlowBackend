const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { emitNewSale } = require('../socket');

// @desc    Create a new sale
// @route   POST /api/sales
// @access  Staff+
const createSale = asyncHandler(async (req, res) => {
  const { items, paymentMethod, customer, location, notes } = req.body;

  await validateSaleItems(items);

  const sale = new Sale({
    items,
    paymentMethod,
    customer: customer || undefined,
    location,
    notes,
    createdBy: req.user.id
  });

  await sale.save();

  // Emit real-time updates
  emitNewSale(sale);

  res.status(201).json(sale);
});

// @desc    Get all sales
// @route   GET /api/sales
// @access  Manager+
const getSales = asyncHandler(async (req, res) => {
  const { startDate, endDate, location } = req.query;
  const filter = {};

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (location) filter.location = location;

  const sales = await Sale.find(filter)
    .populate('items.product', 'name price barcode')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  res.json(sales);
});

// @desc    Get sale by ID
// @route   GET /api/sales/:id
// @access  Staff+
const getSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id)
    .populate('items.product', 'name price barcode')
    .populate('createdBy', 'name email');

  if (!sale) {
    res.status(404);
    throw new Error('Sale not found');
  }

  res.json(sale);
});

// Helper function to validate sale items
async function validateSaleItems(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Sale must contain at least one item');
  }

  await Promise.all(items.map(async item => {
    const product = await Product.findById(item.product);

    if (!product) {
      throw new Error(`Product ${item.product} not found`);
    }

    if (product.quantity < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}`);
    }

    if (item.price <= 0) {
      throw new Error(`Invalid price for ${product.name}`);
    }
  }));
}

module.exports = {
  createSale,
  getSales,
  getSale
};