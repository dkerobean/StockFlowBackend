// services/notificationService.js
const Product = require('../models/Product');
const User = require('../models/User');
const { sendEmailNotification } = require('./emailService');

async function checkLowStock() {
  try {
    const products = await Product.find({
      $expr: { $lte: ["$quantity", "$notifyAt"] },
      $or: [
        { lastNotified: { $exists: false } },
        { lastNotified: { $lt: new Date(Date.now() - 24*60*60*1000) } }
      ]
    }).populate('createdBy');

    const admins = await User.find({ role: 'admin' });

    await Promise.all(products.map(async (product) => {
      await sendEmailNotification(product, admins);
      product.lastNotified = new Date();
      await product.save();
    }));
  } catch (error) {
    console.error('Error in low stock check:', error);
  }
}

function startScheduledChecks() {
  // Run immediately on startup
  checkLowStock();
  // Then run every hour
  setInterval(checkLowStock, 60 * 60 * 1000);
}

module.exports = {
  checkLowStock,
  startScheduledChecks
};