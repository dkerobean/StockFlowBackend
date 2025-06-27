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

    // Process notifications with rate limiting for email service
    for (const product of products) {
      try {
        // Send email notification with retry logic
        await sendLowStockEmail(product, admins);
        
        // Update product record
        product.lastNotified = new Date();
        if (product.auditLog) {
          product.auditLog.push({
            user: null, // System-generated
            action: 'low_stock_notification',
            details: {
              recipients: admins.map(a => a.email),
              quantity: product.quantity,
              threshold: product.notifyAt
            }
          });
        }
        await product.save();

        // Send real-time alert
        io.emit('low_stock', {
          productId: product._id,
          name: product.name,
          quantity: product.quantity,
          threshold: product.notifyAt
        });

        // Add delay to avoid rate limiting (2 requests per second max)
        if (products.indexOf(product) < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 600)); // 600ms delay
        }
      } catch (emailError) {
        console.error(`Failed to send notification for product ${product.name}:`, emailError.message);
        // Continue with other products even if one fails
      }
    }

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