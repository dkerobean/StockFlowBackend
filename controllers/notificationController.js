// controllers/notificationController.js
const Product = require('../models/Product');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const { sendEmailNotification } = require('../services/emailService');

// @desc    Check low stock and send notifications
// @route   GET /api/products/check-low-stock
// @access  Admin
const checkLowStock = asyncHandler(async (req, res) => {
  const products = await Product.find({
    $expr: { $lte: ["$quantity", "$notifyAt"] },
    $or: [
      { lastNotified: { $exists: false } },
      { lastNotified: { $lt: new Date(Date.now() - 24*60*60*1000) } }
    ]
  }).populate('createdBy');

  const admins = await User.find({ role: 'admin' });

  const notifications = await Promise.all(products.map(async (product) => {
    await sendEmailNotification(product, admins);
    product.lastNotified = new Date();
    await product.save();
    return {
      productId: product._id,
      productName: product.name,
      currentStock: product.quantity,
      threshold: product.notifyAt
    };
  }));

  res.json({
    message: 'Low stock check completed',
    notifiedProducts: notifications
  });
});

// @desc    Update notification threshold
// @route   PATCH /api/products/:id/notify-at
// @access  Admin/Manager
const updateNotifyThreshold = asyncHandler(async (req, res) => {
  const { notifyAt } = req.body;

  if (notifyAt < 0) {
    return res.status(400).json({ error: 'Threshold cannot be negative' });
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { notifyAt },
    { new: true, runValidators: true }
  );

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});

module.exports = {
  checkLowStock,
  updateNotifyThreshold
};