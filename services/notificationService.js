const Product = require('../models/Product');
const User = require('../models/User');
const { sendLowStockEmail } = require('./emailService');
const { getIO } = require('../socket');
const enhancedNotificationService = require('./enhancedNotificationService');

async function checkLowStock() {
  try {
    // Use the enhanced notification service instead
    await enhancedNotificationService.checkLowStock();
  } catch (error) {
    console.error('Low stock check failed:', error);
    throw error;
  }
}

function startScheduler() {
  // Initial checks
  checkLowStock().catch(console.error);
  
  // Initial expiry check
  enhancedNotificationService.checkExpiringProducts().catch(console.error);

  // Hourly low stock checks
  const lowStockInterval = setInterval(() => {
    checkLowStock().catch(console.error);
  }, 60 * 60 * 1000); // Every hour

  // Daily expiry checks at 9 AM
  const expiryInterval = setInterval(() => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      enhancedNotificationService.checkExpiringProducts().catch(console.error);
    }
  }, 60 * 1000); // Check every minute for the right time

  return { lowStockInterval, expiryInterval };
}

module.exports = {
  checkLowStock,
  startScheduler
};