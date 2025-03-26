const { checkLowStock } = require('../services/notificationService');
const asyncHandler = require('express-async-handler');

exports.manualLowStockCheck = asyncHandler(async (req, res) => {
  await checkLowStock();
  res.json({
    success: true,
    message: 'Low stock check completed successfully'
  });
});

exports.updateNotificationSettings = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { notifyAt } = req.body;

  const product = await Product.findByIdAndUpdate(
    productId,
    { notifyAt },
    { new: true, runValidators: true }
  );

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json({
    success: true,
    message: 'Notification threshold updated',
    data: product
  });
});