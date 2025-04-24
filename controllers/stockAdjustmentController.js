// controllers/stockAdjustmentController.js
const asyncHandler = require('express-async-handler');
const StockAdjustment = require('../models/StockAdjustment');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Location = require('../models/Location');
const mongoose = require('mongoose');

// @desc    Create a new stock adjustment
// @route   POST /api/stock-adjustments
// @access  Admin, Manager (with location access)
const createStockAdjustment = asyncHandler(async (req, res) => {
    const {
        productId,
        locationId,
        adjustmentType,
        quantityAdjusted, // Always positive
        reason, // Notes
        referenceNumber, // Optional user ref
        adjustmentDate // Optional: defaults to now if not provided
    } = req.body;

    // --- Validation ---
    if (!productId || !locationId || !adjustmentType || quantityAdjusted === undefined || quantityAdjusted === null) {
        res.status(400); throw new Error('Missing required fields: productId, locationId, adjustmentType, quantityAdjusted');
    }
    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(locationId)) {
        res.status(400); throw new Error('Invalid Product or Location ID format');
    }
    const qty = Number(quantityAdjusted);
    if (isNaN(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400); throw new Error('Quantity adjusted must be a non-negative integer');
    }
    if (qty === 0) {
         res.status(400); throw new Error('Quantity adjusted cannot be zero');
    }
     // Validate adjustmentType is in the enum (Mongoose schema validation handles this too, but good practice)
     const validTypes = StockAdjustment.schema.path('adjustmentType').enumValues;
     if (!validTypes.includes(adjustmentType)) {
         res.status(400); throw new Error(`Invalid adjustmentType: ${adjustmentType}. Must be one of: ${validTypes.join(', ')}`);
     }

    // --- Check User Access ---
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(locationId)) {
       res.status(403); throw new Error('Forbidden: You do not have permission to adjust stock at this location.');
    }

    // --- Find or Create Inventory Record ---
    // Use a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let inventory = await Inventory.findOne({ product: productId, location: locationId }).session(session);

        // If inventory record doesn't exist, we generally shouldn't adjust it unless it's an 'Initial Stock' type
        if (!inventory) {
             // Option 1: Disallow adjustment if inventory record doesn't exist (safer)
             // if (adjustmentType !== 'Initial Stock') { // Allow only initial stock if record missing
                 await session.abortTransaction();
                 session.endSession();
                 res.status(404);
                 throw new Error(`Inventory record not found for this product at this location. Cannot adjust stock.`);
            // }
            // Option 2: Create inventory record on the fly (can lead to unintended records)
            // const product = await Product.findById(productId).session(session);
            // const location = await Location.findById(locationId).session(session);
            // if (!product || !location) { throw new Error('Product or Location not found'); }
            // inventory = new Inventory({ product: productId, location: locationId, quantity: 0, createdBy: req.user.id });
            // // Add minimal audit log
            // inventory.auditLog.push({ user: req.user.id, action: 'created_on_adjustment', adjustment: 0, newQuantity: 0, note: 'Created during stock adjustment' });
        }

        const previousQuantity = inventory.quantity;
        let change = 0;

        // Determine the actual change based on type
        if (['Addition', 'Correction', 'Initial Stock', 'Transfer In', 'Return'].includes(adjustmentType)) {
            change = qty;
        } else if (['Subtraction', 'Damage', 'Theft', 'Transfer Out'].includes(adjustmentType)) {
            change = -qty;
        } else { // 'Other' or future types - default to addition or require specific handling
            change = qty; // Or throw error if 'Other' needs specific logic
        }

        const newQuantity = previousQuantity + change;

        // Check for negative stock only if subtracting
        if (change < 0 && newQuantity < 0) {
            await session.abortTransaction();
            session.endSession();
            res.status(400);
            throw new Error(`Adjustment results in negative stock (${newQuantity}). Current: ${previousQuantity}, Adjusting by: ${change}`);
        }

        // --- Update Inventory ---
        inventory.quantity = newQuantity;
        const auditNote = `${adjustmentType}: ${reason || 'No reason specified'}${referenceNumber ? ` (Ref: ${referenceNumber})` : ''}`;
        // Add to Inventory audit log, referencing the adjustment
        inventory.auditLog.push({
            user: req.user.id,
            action: 'adjustment', // Keep action generic or map from adjustmentType
            adjustment: change, // The actual +/- value
            note: auditNote.substring(0, 200), // Limit note length if needed
            newQuantity: newQuantity,
            // We will add relatedAdjustmentId after saving the adjustment
            timestamp: new Date()
        });
        const updatedInventory = await inventory.save({ session }); // Save within transaction

        // --- Create Stock Adjustment Record ---
        const newAdjustment = new StockAdjustment({
            product: productId,
            location: locationId,
            inventory: updatedInventory._id,
            adjustmentType,
            quantityAdjusted: qty, // Store the absolute value
            previousQuantity,
            newQuantity,
            reason: reason,
            referenceNumber: referenceNumber,
            adjustedBy: req.user.id,
            adjustmentDate: adjustmentDate || new Date(), // Use provided date or now
        });
        const savedAdjustment = await newAdjustment.save({ session }); // Save within transaction

        // --- Link Audit Log to Adjustment (Update Inventory Again) ---
        const auditLogEntry = updatedInventory.auditLog[updatedInventory.auditLog.length - 1]; // Get the last entry
        auditLogEntry.relatedAdjustmentId = savedAdjustment._id; // Add the reference
        await updatedInventory.save({ session }); // Save inventory again to include the link

        // --- Commit Transaction ---
        await session.commitTransaction();
        session.endSession();

        // --- Populate and Respond ---
         const populatedAdjustment = await StockAdjustment.findById(savedAdjustment._id)
            .populate('product', 'name sku imageUrl')
            .populate('location', 'name type')
            .populate('adjustedBy', 'name email'); // Populate user name/email


        // --- Emit Socket Event ---
        if (req.io) {
            // Notify about the adjustment itself
            req.io.to('stock_adjustments').emit('adjustmentCreated', populatedAdjustment);
            // Notify about the inventory quantity change
            const populatedInventory = await Inventory.findById(updatedInventory._id)
                                                        .populate('product', 'name sku')
                                                        .populate('location', 'name type');
            if (populatedInventory) {
                req.io.to(`location_${locationId}`).emit('inventoryAdjusted', populatedInventory);
                req.io.to('products').emit('inventoryUpdate', populatedInventory);
            }
        }

        res.status(201).json(populatedAdjustment);

    } catch (error) {
        // If anything fails, abort transaction
        await session.abortTransaction();
        session.endSession();
        console.error("Stock Adjustment Error:", error);
        // Throw error to be caught by global error handler, or send specific response
        res.status(error.statusCode || 500); // Use status code from error if available
        throw new Error(`Failed to create stock adjustment: ${error.message}`);
    }
});


// @desc    Get all stock adjustments with filtering and pagination
// @route   GET /api/stock-adjustments
// @access  Admin, Manager (filtered by location access)
const getStockAdjustments = asyncHandler(async (req, res) => {
    const {
        productId,
        locationId,
        userId, // adjustedBy
        startDate,
        endDate,
        referenceNumber,
        search, // General search (product name/sku, reference, reason)
        page = 1,
        limit = 10
    } = req.query;

    const filter = {};
    const queryPage = parseInt(page, 10);
    const queryLimit = parseInt(limit, 10);
    const skip = (queryPage - 1) * queryLimit;

    // --- Location Access Filter ---
    if (req.user.role !== 'admin') {
        if (!req.user.locations || req.user.locations.length === 0) {
            return res.json({ data: [], pagination: { total: 0, page: queryPage, pages: 0, limit: queryLimit } });
        }
        // User can only see adjustments for locations they have access to
        const accessibleLocations = req.user.locations;
        if (locationId) { // If specific location requested, check access
            if (!accessibleLocations.some(loc => loc.equals(locationId))) {
                res.status(403); throw new Error('Forbidden: Access denied to this location');
            }
            filter.location = locationId;
        } else { // No specific location, filter by all accessible ones
            filter.location = { $in: accessibleLocations };
        }
    } else if (locationId) { // Admin requested specific location
         if (!mongoose.Types.ObjectId.isValid(locationId)) {res.status(400); throw new Error('Invalid Location ID');}
         filter.location = locationId;
    }

    // --- Other Filters ---
    if (productId) { if (!mongoose.Types.ObjectId.isValid(productId)) {res.status(400); throw new Error('Invalid Product ID');} filter.product = productId; }
    if (userId) { if (!mongoose.Types.ObjectId.isValid(userId)) {res.status(400); throw new Error('Invalid User ID');} filter.adjustedBy = userId; }
    if (referenceNumber) { filter.referenceNumber = { $regex: referenceNumber, $options: 'i' }; }

    // Date Range Filter
    if (startDate || endDate) {
        filter.adjustmentDate = {};
        if (startDate) { filter.adjustmentDate.$gte = new Date(startDate); }
        if (endDate) { // Set to end of the day
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            filter.adjustmentDate.$lte = endOfDay;
        }
    }

     // --- Search Filter ---
     if (search) {
         const searchRegex = { $regex: search, $options: 'i' };
         const productIds = (await Product.find({ $or: [{ name: searchRegex }, { sku: searchRegex }] }).select('_id')).map(p => p._id);
         // Note: Searching user names requires populating first or a separate query. Simpler to search product/ref/reason here.
         filter.$or = [
             { product: { $in: productIds } },
             { referenceNumber: searchRegex },
             { reason: searchRegex },
             // Add adjustmentNumber search if using the auto-increment plugin
             // { adjustmentNumber: searchRegex }
         ];
         // If location filter is already applied, combine with $and
         if (filter.location) {
             filter.$and = [
                 { location: filter.location }, // Keep existing location filter
                 { $or: filter.$or } // Apply search conditions
             ];
             // Remove the top-level location and $or filters as they are now nested in $and
             delete filter.location;
             delete filter.$or;
         }
     }


    // --- Execute Query ---
    try {
        const totalItems = await StockAdjustment.countDocuments(filter);
        const adjustments = await StockAdjustment.find(filter)
            .populate('product', 'name sku imageUrl')
            .populate('location', 'name type')
            .populate('adjustedBy', 'name email') // Select fields needed for display
            .sort({ adjustmentDate: -1, createdAt: -1 }) // Sort by adjustment date desc
            .skip(skip)
            .limit(queryLimit);

        res.json({
            data: adjustments,
            pagination: {
                total: totalItems,
                page: queryPage,
                pages: Math.ceil(totalItems / queryLimit),
                limit: queryLimit
            }
        });
    } catch (error) {
        console.error("Error fetching stock adjustments:", error);
        res.status(500);
        throw new Error("Server error fetching stock adjustments");
    }
});

// @desc    Get a single stock adjustment by ID
// @route   GET /api/stock-adjustments/:id
// @access  Admin, Manager (with location access)
const getStockAdjustmentById = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Stock Adjustment ID format');
    }
    const adjustmentId = req.params.id;

    const adjustment = await StockAdjustment.findById(adjustmentId)
        .populate('product', 'name sku description category brand price imageUrl') // Populate more product details if needed
        .populate('location', 'name type address')
        .populate('adjustedBy', 'name email role'); // Populate user details

    if (!adjustment) {
        res.status(404); throw new Error('Stock Adjustment record not found');
    }

    // --- Authorization Check ---
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(adjustment.location._id)) { // Use adjustment.location._id
       res.status(403); throw new Error('Forbidden: Access denied to this stock adjustment record');
    }

    res.json(adjustment);
});


// @desc    Update a stock adjustment (LIMITED SCOPE - e.g., only reason/reference)
// @route   PUT /api/stock-adjustments/:id
// @access  Admin, Manager (with location access)
const updateStockAdjustment = asyncHandler(async (req, res) => {
    // *** CAUTION: Updating historical adjustments (especially quantity) is generally bad practice for auditing. ***
    // *** Limit updates to non-critical fields like 'reason' or 'referenceNumber'. ***
    // *** If a quantity was wrong, create a *new* 'Correction' adjustment. ***

     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Stock Adjustment ID format');
    }
    const adjustmentId = req.params.id;
    const { reason, referenceNumber } = req.body; // Only allow updating these fields

    const adjustment = await StockAdjustment.findById(adjustmentId);

    if (!adjustment) {
        res.status(404); throw new Error('Stock Adjustment record not found');
    }

    // --- Authorization Check ---
     if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(adjustment.location)) {
       res.status(403); throw new Error('Forbidden: Access denied to update this record');
    }

    let updated = false;
    if (reason !== undefined && adjustment.reason !== reason) {
        adjustment.reason = reason;
        updated = true;
    }
     if (referenceNumber !== undefined && adjustment.referenceNumber !== referenceNumber) {
        adjustment.referenceNumber = referenceNumber;
        updated = true;
    }

    if (!updated) {
        return res.status(200).json(adjustment); // No changes made
    }

    // Add audit log to the adjustment itself? Optional.
    // adjustment.updateHistory.push({ user: req.user.id, timestamp: new Date(), changes: { reason, referenceNumber } });

    const updatedAdjustment = await adjustment.save();

    // Populate for response
     const populatedAdjustment = await StockAdjustment.findById(updatedAdjustment._id)
            .populate('product', 'name sku imageUrl')
            .populate('location', 'name type')
            .populate('adjustedBy', 'name email');

     // Emit socket event
      if (req.io) {
          req.io.to('stock_adjustments').emit('adjustmentUpdated', populatedAdjustment);
      }


    res.json(populatedAdjustment);
});


// @desc    Delete a stock adjustment (VERY DANGEROUS - STRONGLY DISCOURAGED)
// @route   DELETE /api/stock-adjustments/:id
// @access  Admin ONLY
// NOTE: Deleting adjustments breaks the audit trail. A better approach is to create
//       a reversing/correcting adjustment. This endpoint is included for completeness
//       but should ideally be disabled or heavily restricted.
const deleteStockAdjustment = asyncHandler(async (req, res) => {
    // --- >>> WARNING: THIS IS GENERALLY A BAD IDEA <<< ---
    res.status(403).json({ message: "Deleting historical stock adjustments is disabled for audit integrity. Please create a correcting adjustment instead." });
    return; // Prevent execution
    // --- >>> END WARNING <<< ---

    /*
    // If you MUST enable deletion (e.g., for accidental duplicates created immediately):
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Stock Adjustment ID format');
    }
    const adjustmentId = req.params.id;

    const adjustment = await StockAdjustment.findById(adjustmentId);

    if (!adjustment) {
        res.status(404); throw new Error('Stock Adjustment record not found');
    }

    // --- Authorization Check (Strictly Admin) ---
     if (req.user.role !== 'admin') { // Only allow Admins to potentially delete
       res.status(403); throw new Error('Forbidden: Only administrators can delete adjustment records.');
    }

    // --- COMPLEXITY: Reversing the Inventory Change ---
    // This is where it gets tricky and error-prone. You'd need to:
    // 1. Find the corresponding Inventory record.
    // 2. Calculate the *reverse* adjustment amount.
    // 3. Update the Inventory quantity.
    // 4. Add *another* audit log entry to Inventory explaining the reversal due to deletion.
    // 5. Delete the StockAdjustment record.
    // ALL OF THIS SHOULD BE IN A TRANSACTION.

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inventory = await Inventory.findById(adjustment.inventory).session(session);
        if (!inventory) {
            // Inventory record might have been deleted? Handle this edge case.
            // For simplicity here, we'll just delete the adjustment if inventory is missing.
             await StockAdjustment.findByIdAndDelete(adjustmentId, { session });
             await session.commitTransaction(); session.endSession();
             if (req.io) { req.io.to('stock_adjustments').emit('adjustmentDeleted', adjustmentId); }
             return res.status(200).json({ message: 'Stock Adjustment deleted (Inventory record not found)' });
        }

        // Calculate reversal
        let change = 0;
        if (['Addition', 'Correction', 'Initial Stock', 'Transfer In', 'Return'].includes(adjustment.adjustmentType)) {
            change = -adjustment.quantityAdjusted; // Subtract to reverse addition
        } else if (['Subtraction', 'Damage', 'Theft', 'Transfer Out'].includes(adjustment.adjustmentType)) {
            change = adjustment.quantityAdjusted; // Add to reverse subtraction
        }
        // Handle 'Other' case if necessary

        const previousQtyInv = inventory.quantity;
        const newQtyInv = previousQtyInv + change;

        // Add audit log *before* deleting adjustment
        inventory.auditLog.push({
             user: req.user.id,
             action: 'reversal',
             adjustment: change,
             note: `Reversal due to deletion of Adjustment ID: ${adjustment._id} (Ref: ${adjustment.referenceNumber || 'N/A'})`,
             newQuantity: newQtyInv,
             relatedAdjustmentId: adjustment._id, // Reference the adjustment being deleted
             timestamp: new Date()
        });
        inventory.quantity = newQtyInv;
        await inventory.save({ session });

        // Finally, delete the adjustment record
        await StockAdjustment.findByIdAndDelete(adjustmentId, { session });

        await session.commitTransaction();
        session.endSession();

        if (req.io) {
            req.io.to('stock_adjustments').emit('adjustmentDeleted', adjustmentId);
            // Also emit inventory update
            const populatedInventory = await Inventory.findById(inventory._id).populate...;
            req.io.to(`location_${inventory.location}`).emit('inventoryAdjusted', populatedInventory);
            req.io.to('products').emit('inventoryUpdate', populatedInventory);
        }

        res.status(200).json({ message: 'Stock Adjustment deleted and inventory reversed successfully' });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error deleting stock adjustment:", error);
        res.status(500); throw new Error(`Failed to delete stock adjustment: ${error.message}`);
    }
    */
});


module.exports = {
    createStockAdjustment,
    getStockAdjustments,
    getStockAdjustmentById,
    updateStockAdjustment,
    deleteStockAdjustment
};