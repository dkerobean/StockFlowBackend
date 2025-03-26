let ioInstance = null;

function initSocket(server) {
  const io = require('socket.io')(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Sales room subscription
    socket.on('subscribeToSales', () => {
      socket.join('sales');
      console.log(`Client ${socket.id} joined sales room`);
    });

    // Products room subscription
    socket.on('subscribeToProducts', () => {
      socket.join('products');
      console.log(`Client ${socket.id} joined products room`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  ioInstance = io;
  return io;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized!');
  }
  return ioInstance;
}

// Helper function for sales events
function emitNewSale(sale) {
  const io = getIO();
  io.to('sales').emit('newSale', sale);
  io.to('products').emit('inventoryUpdate', {
    type: 'sale',
    items: sale.items
  });
}

module.exports = {
  initSocket,
  getIO,
  emitNewSale
};