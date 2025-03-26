const Product = require('../models/Product');
const User = require('../models/User');
const { sendLowStockEmail } = require('./emailService');
const { getIO } = require('../socket');

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
    const io = getIO();

    await Promise.all(products.map(async (product) => {
      // Send email notification
      await sendLowStockEmail(product, admins);

      // Update product record
      product.lastNotified = new Date();
      product.auditLog.push({
        user: null, // System-generated
        action: 'low_stock_notification',
        details: {
          recipients: admins.map(a => a.email),
          quantity: product.quantity,
          threshold: product.notifyAt
        }
      });
      await product.save();

      // Send real-time alert
      io.emit('low_stock', {
        productId: product._id,
        name: product.name,
        quantity: product.quantity,
        threshold: product.notifyAt
      });
    }));

    console.log(`Processed ${products.length} low stock notifications`);
  } catch (error) {
    console.error('Low stock check failed:', error);
    throw error;
  }
}

function startScheduler() {
  // Initial check
  checkLowStock().catch(console.error);

  // Hourly checks
  const interval = setInterval(() => {
    checkLowStock().catch(console.error);
  }, 60 * 60 * 1000);

  return interval;
}

module.exports = {
  checkLowStock,
  startScheduler
};