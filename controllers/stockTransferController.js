const asyncHandler = require('express-async-handler');
const StockTransfer = require('../models/StockTransfer');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Location = require('../models/Location');
const mongoose = require('mongoose');

// @desc    Create a stock transfer request
// @route   POST /api/transfers
// @access  Admin, Manager (with access to fromLocation)
const createTransfer = asyncHandler(async (req, res) => {
    const { productId, quantity, fromLocationId, toLocationId, notes } = req.body;

    // --- Basic Validation ---
    if (!productId || !quantity || !fromLocationId || !toLocationId) {
        res.status(400); throw new Error('Missing required fields: productId, quantity, fromLocationId, toLocationId');
    }
    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(fromLocationId) || !mongoose.Types.ObjectId.isValid(toLocationId)) {
         res.status(400); throw new Error('Invalid ID format for product or locations');
    }
     const transferQuantity = Number(quantity);
    if (isNaN(transferQuantity) || transferQuantity <= 0) {
        res.status(400); throw new Error('Quantity must be a positive number');
    }
     if (fromLocationId === toLocationId) {
        res.status(400); throw new Error('Cannot transfer stock to the same location');
    }

    // --- Authorization ---
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(fromLocationId)) {
        res.status(403); throw new Error('Forbidden: You do not have access to transfer stock FROM this location');
    }

    // --- Existence & Activity Checks ---
    const [product, fromLocation, toLocation] = await Promise.all([
        Product.findOne({ _id: productId, isActive: true }),
        Location.findOne({ _id: fromLocationId, isActive: true }),
        Location.findOne({ _id: toLocationId, isActive: true })
    ]);
    if (!product) { res.status(404); throw new Error('Active Product not found'); }
    if (!fromLocation) { res.status(404); throw new Error('Active FROM Location not found'); }
    if (!toLocation) { res.status(404); throw new Error('Active TO Location not found'); }

    // --- Stock Availability Check ---
    const fromInventory = await Inventory.findOne({ product: productId, location: fromLocationId });
    if (!fromInventory || fromInventory.quantity < transferQuantity) {
        res.status(400);
        throw new Error(`Insufficient stock for ${product.name} at ${fromLocation.name}. Available: ${fromInventory?.quantity || 0}`);
    }

    // --- Create Transfer Record ---
    const transfer = new StockTransfer({
        product: productId,
        quantity: transferQuantity,
        fromLocation: fromLocationId,
        toLocation: toLocationId,
        status: 'Pending',
        notes,
        requestedBy: req.user.id,
        requestedAt: new Date()
    });

    const createdTransfer = await transfer.save();

    // Populate for response
    const populatedTransfer = await StockTransfer.findById(createdTransfer._id)
        .populate('product', 'name sku')
        .populate('fromLocation', 'name type')
        .populate('toLocation', 'name type')
        .populate('requestedBy', 'name email');

    // Emit socket event
    if(req.io) {
        req.io.to(`location_${fromLocationId}`).to(`location_${toLocationId}`).emit('transferCreated', populatedTransfer);
    }

    res.status(201).json(populatedTransfer);
});


// @desc    Get stock transfers
// @route   GET /api/transfers
// @access  Authenticated User (filtered by access)
const getTransfers = asyncHandler(async (req, res) => {
    const { status, fromLocationId, toLocationId, productId } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (productId) {
         if (!mongoose.Types.ObjectId.isValid(productId)) {res.status(400); throw new Error('Invalid Product ID');}
         filter.product = productId;
    }
    if (fromLocationId) {
        if (!mongoose.Types.ObjectId.isValid(fromLocationId)) {res.status(400); throw new Error('Invalid From Location ID');}
        filter.fromLocation = fromLocationId;
    }
    if (toLocationId) {
        if (!mongoose.Types.ObjectId.isValid(toLocationId)) {res.status(400); throw new Error('Invalid To Location ID');}
        filter.toLocation = toLocationId;
    }

    // Authorization Filtering: Admins see all. Others see transfers involving their locations.
    if (req.user.role !== 'admin') {
         if (!req.user.locations || req.user.locations.length === 0) {
            return res.json([]); // No locations, no transfers visible
         }
         // If specific locations are filtered, ensure user has access to at least one of them
         const requestedLocations = [fromLocationId, toLocationId].filter(id => id);
         if (requestedLocations.length > 0 && !requestedLocations.some(locId => req.user.hasAccessToLocation(locId))) {
             res.status(403); throw new Error('Forbidden: You do not have access to view transfers for the specified locations.');
         }

         // Filter transfers where the user has access to EITHER the from OR the to location
         filter.$or = [
            { fromLocation: { $in: req.user.locations } },
            { toLocation: { $in: req.user.locations } }
         ];
    }


    const transfers = await StockTransfer.find(filter)
        .populate('product', 'name sku')
        .populate('fromLocation', 'name type')
        .populate('toLocation', 'name type')
        .populate('requestedBy', 'name email')
        .populate('shippedBy', 'name email')
        .populate('receivedBy', 'name email')
        .sort({ createdAt: -1 }); // Show newest first

    res.json(transfers);
});

// @desc    Get a single stock transfer by ID
// @route   GET /api/transfers/:id
// @access  Authenticated User (with access to either location)
const getTransferById = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Transfer ID format');
    }

    const transfer = await StockTransfer.findById(req.params.id)
        .populate('product', 'name sku description')
        .populate('fromLocation', 'name type address')
        .populate('toLocation', 'name type address')
        .populate('requestedBy', 'name email')
        .populate('shippedBy', 'name email')
        .populate('receivedBy', 'name email');

    if (!transfer) {
        res.status(404); throw new Error('Stock Transfer not found');
    }

    // Authorization: Admin or user with access to FROM or TO location
    if (req.user.role !== 'admin' &&
        !req.user.hasAccessToLocation(transfer.fromLocation._id) &&
        !req.user.hasAccessToLocation(transfer.toLocation._id))
    {
        res.status(403); throw new Error('Forbidden: You do not have access to view this transfer.');
    }

    res.json(transfer);
});


// @desc    Mark a transfer as shipped (decrements stock at source)
// @route   PATCH /api/transfers/:id/ship
// @access  Admin, Manager (with access to fromLocation)
const shipTransfer = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Transfer ID format');
    }
    const transferId = req.params.id;

    const transfer = await StockTransfer.findById(transferId);
    if (!transfer) { res.status(404); throw new Error('Stock Transfer not found'); }

    // --- Authorization & Validation ---
    if (transfer.status !== 'Pending') {
        res.status(400); throw new Error(`Cannot ship transfer with status: ${transfer.status}`);
    }
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(transfer.fromLocation)) {
        res.status(403); throw new Error('Forbidden: You do not have access to ship transfers FROM this location');
    }

    // --- Atomic Operation (Decrement Stock & Update Transfer) ---
    // Ideally use a transaction here. Without it, there's a small risk
    // the inventory update succeeds but the transfer update fails (or vice-versa).

    const fromInventory = await Inventory.findOne({
        product: transfer.product,
        location: transfer.fromLocation
    });

    if (!fromInventory || fromInventory.quantity < transfer.quantity) {
        // Stock level changed since request, cannot fulfill
        res.status(400);
        throw new Error(`Insufficient stock to ship. Available: ${fromInventory?.quantity || 0}`);
    }

    // 1. Update Inventory
    const newQuantity = fromInventory.quantity - transfer.quantity;
    fromInventory.quantity = newQuantity;
    fromInventory.auditLog.push({
        user: req.user.id,
        action: 'transfer_out',
        adjustment: -transfer.quantity,
        note: `Shipped for Transfer ID: ${transfer.transferId || transfer._id}`,
        relatedTransferId: transfer._id,
        newQuantity: newQuantity,
        timestamp: new Date()
    });

    // 2. Update Transfer Status
    transfer.status = 'Shipped';
    transfer.shippedBy = req.user.id;
    transfer.shippedAt = new Date();

    // --- Save Both ---
    // Use Promise.all to run saves concurrently, but still not a true transaction
    await Promise.all([
        fromInventory.save(),
        transfer.save()
    ]);

    // --- Respond & Emit ---
    const populatedTransfer = await StockTransfer.findById(transfer._id) // Re-populate after save
       .populate('product', 'name sku')
       .populate('fromLocation', 'name type')
       .populate('toLocation', 'name type')
       .populate('requestedBy', 'name email')
       .populate('shippedBy', 'name email');


     // Emit events
     if(req.io) {
        // Update transfer status
        req.io.to(`location_${transfer.fromLocation.toString()}`).to(`location_${transfer.toLocation.toString()}`).emit('transferUpdated', populatedTransfer);
        // Update inventory at source location
        req.io.to(`location_${transfer.fromLocation.toString()}`).emit('inventoryAdjusted', { /* Send inventory data */
            inventoryId: fromInventory._id,
            productId: fromInventory.product,
            locationId: fromInventory.location,
            newQuantity: newQuantity,
            adjustment: -transfer.quantity,
            action: 'transfer_out',
            transferId: transfer._id
        });
        req.io.to('products').emit('inventoryUpdate', { /* simplified payload */});
     }


    res.json(populatedTransfer);
});


// @desc    Mark a transfer as received (increments stock at destination)
// @route   PATCH /api/transfers/:id/receive
// @access  Admin, Manager (with access to toLocation)
const receiveTransfer = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Transfer ID format');
    }
    const transferId = req.params.id;

    const transfer = await StockTransfer.findById(transferId);
    if (!transfer) { res.status(404); throw new Error('Stock Transfer not found'); }

    // --- Authorization & Validation ---
    if (transfer.status !== 'Shipped') {
        res.status(400); throw new Error(`Cannot receive transfer with status: ${transfer.status}`);
    }
     if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(transfer.toLocation)) {
        res.status(403); throw new Error('Forbidden: You do not have access to receive transfers AT this location');
    }

    // --- Atomic Operation (Increment Stock & Update Transfer) ---
    // Again, transactions recommended.

    // Find or Create Inventory record at destination
    let toInventory = await Inventory.findOne({
        product: transfer.product,
        location: transfer.toLocation
    });

    let newQuantity;
    if (!toInventory) {
        // Product doesn't exist in this location's inventory yet, create it.
        toInventory = new Inventory({
            product: transfer.product,
            location: transfer.toLocation,
            quantity: transfer.quantity, // Starts with the received quantity
            // Should ideally pull default minStock/notifyAt from Product or have defaults
            minStock: 5,
            notifyAt: 5,
            createdBy: req.user.id, // User receiving the transfer initiates the record here
            auditLog: [{
                user: req.user.id,
                action: 'transfer_in',
                adjustment: transfer.quantity,
                note: `Received via Transfer ID: ${transfer.transferId || transfer._id}. Created inventory record.`,
                relatedTransferId: transfer._id,
                newQuantity: transfer.quantity,
                timestamp: new Date()
            }]
        });
        newQuantity = transfer.quantity;
    } else {
        // Inventory record exists, increment it
        newQuantity = toInventory.quantity + transfer.quantity;
        toInventory.quantity = newQuantity;
        toInventory.auditLog.push({
            user: req.user.id,
            action: 'transfer_in',
            adjustment: transfer.quantity,
            note: `Received via Transfer ID: ${transfer.transferId || transfer._id}`,
            relatedTransferId: transfer._id,
            newQuantity: newQuantity,
            timestamp: new Date()
        });
    }

    // Update Transfer Status
    transfer.status = 'Received';
    transfer.receivedBy = req.user.id;
    transfer.receivedAt = new Date();

    // Save Both
    await Promise.all([
        toInventory.save(),
        transfer.save()
    ]);

    // --- Respond & Emit ---
     const populatedTransfer = await StockTransfer.findById(transfer._id) // Re-populate after save
       .populate('product', 'name sku')
       .populate('fromLocation', 'name type')
       .populate('toLocation', 'name type')
       .populate('requestedBy', 'name email')
       .populate('receivedBy', 'name email');

     // Emit events
     if(req.io) {
        // Update transfer status
        req.io.to(`location_${transfer.fromLocation.toString()}`).to(`location_${transfer.toLocation.toString()}`).emit('transferUpdated', populatedTransfer);
        // Update inventory at destination location
        req.io.to(`location_${transfer.toLocation.toString()}`).emit('inventoryAdjusted', { /* Send inventory data */
            inventoryId: toInventory._id,
            productId: toInventory.product,
            locationId: toInventory.location,
            newQuantity: newQuantity,
            adjustment: transfer.quantity,
            action: 'transfer_in',
            transferId: transfer._id
        });
        req.io.to('products').emit('inventoryUpdate', { /* simplified payload */});
     }


    res.json(populatedTransfer);
});

// @desc    Cancel a pending stock transfer
// @route   PATCH /api/transfers/:id/cancel
// @access  Admin, Manager (with access to either location), Original Requester
const cancelTransfer = asyncHandler(async (req, res) => {
    const { cancellationReason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Transfer ID format');
    }
    const transferId = req.params.id;

    if (!cancellationReason) {
        res.status(400); throw new Error('Cancellation reason is required');
    }

    const transfer = await StockTransfer.findById(transferId);
    if (!transfer) { res.status(404); throw new Error('Stock Transfer not found'); }

    // --- Validation ---
    if (transfer.status !== 'Pending') {
        res.status(400); throw new Error(`Cannot cancel transfer with status: ${transfer.status}`);
    }

    // --- Authorization ---
    const canCancel = req.user.role === 'admin' ||
                      req.user.hasAccessToLocation(transfer.fromLocation) ||
                      req.user.hasAccessToLocation(transfer.toLocation) ||
                      transfer.requestedBy.equals(req.user.id);

    if (!canCancel) {
        res.status(403); throw new Error('Forbidden: You do not have permission to cancel this transfer.');
    }

    // --- Update Transfer ---
    transfer.status = 'Cancelled';
    transfer.cancellationReason = cancellationReason;
    transfer.cancelledAt = new Date();
    // Optionally track who cancelled: transfer.cancelledBy = req.user.id; (add field to schema)

    const updatedTransfer = await transfer.save();

    // --- Respond & Emit ---
     const populatedTransfer = await StockTransfer.findById(transfer._id) // Re-populate after save
       .populate('product', 'name sku')
       .populate('fromLocation', 'name type')
       .populate('toLocation', 'name type')
       .populate('requestedBy', 'name email');

    // Emit event
    if(req.io) {
        req.io.to(`location_${transfer.fromLocation.toString()}`).to(`location_${transfer.toLocation.toString()}`).emit('transferUpdated', populatedTransfer);
    }

    res.json(populatedTransfer);
});

module.exports = {
    createTransfer,
    getTransfers,
    getTransferById,
    shipTransfer,
    receiveTransfer,
    cancelTransfer,
};