const { getIO } = require('../socket');

// Test endpoint to trigger real-time events for dashboard testing
const triggerTestSale = async (req, res) => {
  try {
    const io = getIO();
    
    const testSale = {
      _id: 'test-' + Date.now(),
      total: Math.floor(Math.random() * 1000) + 100,
      paymentMethod: 'credit_card',
      status: 'completed',
      customer: {
        name: 'Test Customer'
      },
      items: [{
        product: 'test-product',
        quantity: Math.floor(Math.random() * 5) + 1,
        price: Math.floor(Math.random() * 200) + 50
      }],
      createdAt: new Date()
    };

    // Emit to all connected clients
    io.emit('newSale', testSale);
    
    console.log('📊 Test sale event emitted:', testSale);
    
    res.json({
      success: true,
      message: 'Test sale event triggered',
      data: testSale
    });
  } catch (error) {
    console.error('Error triggering test sale:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger test sale',
      error: error.message
    });
  }
};

const triggerTestInventoryUpdate = async (req, res) => {
  try {
    const io = getIO();
    
    const testInventory = {
      inventoryId: 'test-inv-' + Date.now(),
      productId: 'test-product-' + Math.floor(Math.random() * 100),
      locationId: 'test-location-1',
      newQuantity: Math.floor(Math.random() * 20),
      adjustment: -Math.floor(Math.random() * 5) - 1,
      action: 'sale',
      timestamp: new Date()
    };

    // Emit to all connected clients
    io.emit('inventoryAdjusted', testInventory);
    
    console.log('📦 Test inventory event emitted:', testInventory);
    
    res.json({
      success: true,
      message: 'Test inventory update event triggered',
      data: testInventory
    });
  } catch (error) {
    console.error('Error triggering test inventory update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger test inventory update',
      error: error.message
    });
  }
};

const triggerCriticalAlert = async (req, res) => {
  try {
    const io = getIO();
    
    const criticalAlert = {
      id: 'alert-' + Date.now(),
      type: 'critical',
      title: 'Critical Stock Alert!',
      message: 'Product XYZ is out of stock',
      urgency: 'critical',
      timestamp: new Date()
    };

    // Emit to all connected clients
    io.emit('criticalAlert', criticalAlert);
    
    console.log('🚨 Critical alert emitted:', criticalAlert);
    
    res.json({
      success: true,
      message: 'Critical alert triggered',
      data: criticalAlert
    });
  } catch (error) {
    console.error('Error triggering critical alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger critical alert',
      error: error.message
    });
  }
};

const triggerProductUpdate = async (req, res) => {
  try {
    const io = getIO();
    
    const productUpdate = {
      _id: 'test-product-' + Date.now(),
      name: 'Test Product ' + Math.floor(Math.random() * 100),
      price: Math.floor(Math.random() * 500) + 50,
      sku: 'TEST-' + Math.floor(Math.random() * 1000),
      action: 'updated',
      timestamp: new Date()
    };

    // Emit to all connected clients
    io.emit('productUpdated', productUpdate);
    
    console.log('🛍️ Product update event emitted:', productUpdate);
    
    res.json({
      success: true,
      message: 'Product update event triggered',
      data: productUpdate
    });
  } catch (error) {
    console.error('Error triggering product update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger product update',
      error: error.message
    });
  }
};

// Get connected clients count
const getConnectedClients = async (req, res) => {
  try {
    const io = getIO();
    const connectedClients = io.engine.clientsCount;
    
    res.json({
      success: true,
      connectedClients,
      rooms: Object.keys(io.sockets.adapter.rooms),
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error getting connected clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connected clients',
      error: error.message
    });
  }
};

module.exports = {
  triggerTestSale,
  triggerTestInventoryUpdate,
  triggerCriticalAlert,
  triggerProductUpdate,
  getConnectedClients
};