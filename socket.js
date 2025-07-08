// socket.js
let ioInstance = null;

function initSocket(server) {
  const io = require('socket.io')(server, {
    cors: {
      origin: [
        process.env.CLIENT_URL || 'http://localhost:4000',
        'http://localhost:3000', // React dev server default
        'http://localhost:4000', // Custom frontend port
        'http://127.0.0.1:4000',
        'http://127.0.0.1:3000'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // --- Join General Rooms (Optional - for admins or broad updates) ---
    socket.on('subscribeToAllSales', () => { // Example for an admin feed
        // Optional: Add role check here based on socket auth if implemented
        socket.join('all_sales');
        console.log(`Client ${socket.id} joined all_sales room`);
    });

    socket.on('subscribeToProductDefinitions', () => { // For changes to Product schema itself
        socket.join('product_definitions');
        console.log(`Client ${socket.id} joined product_definitions room`);
    });


    // --- Join Location-Specific Rooms ---
    socket.on('subscribeToLocation', (locationId) => {
      if (locationId) {
        // **IMPORTANT**: Add authentication/authorization here!
        // Verify that the user associated with this socket IS ALLOWED
        // to view data for this locationId before joining the room.
        // This might involve checking the JWT associated with the socket connection.
        console.log(`Client ${socket.id} attempting to join room for location: ${locationId}`);
        const roomName = `location_${locationId}`;
        socket.join(roomName);
        console.log(`Client ${socket.id} joined room: ${roomName}`);
        // You could emit a confirmation back to the client here
        socket.emit('subscribedToLocation', { success: true, locationId });
      } else {
         console.warn(`Client ${socket.id} tried to subscribe without a locationId.`);
         socket.emit('subscribedToLocation', { success: false, error: 'locationId is required' });
      }
    });

    // --- Leave Location-Specific Rooms ---
     socket.on('unsubscribeFromLocation', (locationId) => {
        if (locationId) {
            const roomName = `location_${locationId}`;
            socket.leave(roomName);
            console.log(`Client ${socket.id} left room: ${roomName}`);
            socket.emit('unsubscribedFromLocation', { success: true, locationId });
        }
     });


    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      // Consider cleanup if you track socket/user/room mappings
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

// --- Revised Helper Functions (Examples - emission logic mostly moves to controllers/hooks) ---

// Use this for general sale feed (e.g., admin)
function emitNewSaleToAll(sale) {
  const io = getIO();
  io.to('all_sales').emit('newSale', sale); // Send full sale object
}

// Use this to notify a specific location about a new sale occurring there
function emitNewSaleToLocation(locationId, sale) {
    if (!locationId) return;
    const io = getIO();
    const roomName = `location_${locationId}`;
    io.to(roomName).emit('newSale', sale); // Send full sale object to the specific location room
}


// **IMPORTANT**: Instead of a generic inventoryUpdate helper,
// specific events should be emitted from where the change happens
// (e.g., inventoryController.adjustInventory, saleController post-save hook, stockTransferController ship/receive)

/* Example of what an inventory update emission might look like (called from controller/hook):
function emitInventoryAdjustment(inventoryData) {
    // inventoryData should contain { inventoryId, productId, locationId, newQuantity, adjustment, action, relatedDocId (sale/transfer), user... }
    const io = getIO();
    const roomName = `location_${inventoryData.locationId}`;
    // Emit to the specific location
    io.to(roomName).emit('inventoryAdjusted', inventoryData);
    // Optionally emit a simpler notification to a general product/admin room
    // io.to('some_general_room').emit('inventoryChanged', { productId: inventoryData.productId, locationId: inventoryData.locationId, newQuantity: inventoryData.newQuantity });
}
*/

// Example for Product Definition changes (call from productController)
function emitProductDefinitionUpdate(product) {
    const io = getIO();
    io.to('product_definitions').emit('productUpdated', product);
}

// Example for Transfer updates (call from stockTransferController)
function emitTransferUpdate(transfer) {
    const io = getIO();
    const fromRoom = `location_${transfer.fromLocation}`; // Assumes IDs are populated or available
    const toRoom = `location_${transfer.toLocation}`;
    // Emit to both relevant locations and maybe an admin room
    io.to(fromRoom).to(toRoom).emit('transferUpdated', transfer);
    // io.to('admin_transfers_room').emit('transferUpdated', transfer);
}


module.exports = {
  initSocket,
  getIO,
  // Export specific helpers if needed, but primary emission logic moves
  emitNewSaleToAll,
  emitNewSaleToLocation,
  emitProductDefinitionUpdate,
  emitTransferUpdate
  // No longer export the old emitNewSale
};