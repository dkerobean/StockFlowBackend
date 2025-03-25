// services/notificationService.js
const Product = require('../models/Product');
const User = require('../models/User');
const { sendEmailNotification } = require('./emailService');

async function checkLowStock() {
  const products = await Product.find({
    quantity: { $lte: '$notifyAt' },
    $or: [
      { lastNotified: { $exists: false } },
      { lastNotified: { $lt: new Date(Date.now() - 24*60*60*1000) } } // Fixed here
    ]
  }).populate('createdBy');

  products.forEach(async (product) => {
    const admins = await User.find({ role: 'admin' });

    // Send notifications (implement your preferred method)
    sendEmailNotification(product, admins);
    sendPushNotification(product);

    // Update last notified time
    product.lastNotified = new Date();
    await product.save();
  });
}

// Run every hour
setInterval(checkLowStock, 60 * 60 * 1000);