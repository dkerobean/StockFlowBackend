const Product = require('../models/Product');
const asyncHandler = require('express-async-handler');

// @desc    Create product
// @route   POST /api/products
// @access  Admin/Manager
const createProduct = asyncHandler(async (req, res) => {
  const { quantity } = req.body;

  if (quantity < 0) {
    return res.status(400).json({ error: 'Initial quantity cannot be negative' });
  }

  const product = new Product({
    ...req.body,
    createdBy: req.user.id
  });

  await product.save();
  req.io.emit('productUpdate', product);
  res.status(201).json(product);
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Admin/Manager
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  req.io.emit('productUpdate', product);
  res.json(product);
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  req.io.emit('productDelete', product._id);
  res.sendStatus(204);
});

// @desc    Get all products
// @route   GET /api/products
// @access  Authenticated
const getProducts = asyncHandler(async (req, res) => {
  const { category, location, brand, search } = req.query;
  const filter = {};

  if (category) filter.category = category;
  if (location) filter.location = location;
  if (brand) filter.brand = brand;

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const products = await Product.find(filter)
    .populate('createdBy', 'email role')
    .sort({ createdAt: -1 });

  res.json(products);
});

// @desc    Adjust stock
// @route   PATCH /api/products/:id/stock
// @access  Admin/Manager
const adjustStock = asyncHandler(async (req, res) => {
  const { adjustment, note } = req.body;
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const newQuantity = product.quantity + adjustment;
  if (newQuantity < 0) {
    return res.status(400).json({
      error: `Cannot adjust stock below 0 (current: ${product.quantity})`
    });
  }

  product.quantity = newQuantity;
  product.auditLog.push({
    user: req.user.id,
    action: 'stock_adjustment',
    adjustment,
    note,
    newQuantity
  });

  await product.save();
  req.io.emit('stockUpdate', product);
  res.json(product);
});

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  adjustStock
};