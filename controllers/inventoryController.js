const asyncHandler = require('express-async-handler');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Location = require('../models/Location');
const mongoose = require('mongoose');

// @desc    Add a product to a location's inventory (initially often 0)
// @route   POST /api/inventory
// @access  Admin, Manager (with access to location)
const addInventoryRecord = asyncHandler(async (req, res) => {
    const { productId, locationId, initialQuantity, minStock, notifyAt } = req.body;

    if (!productId || !locationId) {
        res.status(400); throw new Error('Product ID and Location ID are required');
    }
    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(locationId)) {
         res.status(400); throw new Error('Invalid Product or Location ID format');
    }

    // Check if user has access to this location (Middleware should handle this, but double check concept)
    if (req.user.role !== 'admin' && !req.user.locations.some(locId => locId.equals(locationId))) {
         res.status(403); throw new Error('Forbidden: You do not have access to manage inventory at this location.');
    }

    // Validate Product and Location exist and are active
    const product = await Product.findOne({ _id: productId, isActive: true });
    const location = await Location.findOne({ _id: locationId, isActive: true });

    if (!product) { res.status(404); throw new Error('Active Product not found'); }
    if (!location) { res.status(404); throw new Error('Active Location not found'); }

    // Check if inventory record already exists
    const existingInventory = await Inventory.findOne({ product: productId, location: locationId });
    if (existingInventory) {
        res.status(409); // Conflict
        throw new Error(`Inventory record already exists for ${product.name} at ${location.name}. Use adjustment endpoint.`);
    }

    const quantity = Number(initialQuantity) || 0;
    if (quantity < 0) {
         res.status(400); throw new Error('Initial quantity cannot be negative');
    }

    const inventoryData = {
        product: productId,
        location: locationId,
        quantity: quantity,
        minStock: minStock !== undefined ? Number(minStock) : 5, // Use provided or default
        createdBy: req.user.id, // Who created this inventory entry
        auditLog: [{
            user: req.user.id,
            action: 'added_to_location',
            adjustment: quantity, // The initial amount added
            note: 'Product added to location inventory',
            newQuantity: quantity,
            timestamp: new Date()
        }]
    };
     // Set notifyAt, defaulting to minStock if not provided
     inventoryData.notifyAt = notifyAt !== undefined ? Number(notifyAt) : inventoryData.minStock;


    const newInventory = new Inventory(inventoryData);
    const savedInventory = await newInventory.save();

    // Populate for response
    const populatedInventory = await Inventory.findById(savedInventory._id)
                                                .populate('product', 'name sku')
                                                .populate('location', 'name type');

     if (req.io) {
       req.io.to(`location_${locationId}`).emit('inventoryAdded', populatedInventory);
       req.io.to('products').emit('inventoryUpdate', populatedInventory); // General update too
     }


    res.status(201).json(populatedInventory);
});


// @desc    Get inventory records with filtering
// @route   GET /api/inventory
// @access  Authenticated User (filtered by access)
const getInventory = asyncHandler(async (req, res) => {
    // --- Extract query parameters ---
    const {
        productId,
        locationId,
        lowStock,
        search, // <-- Extract search parameter
        page = 1,   // <-- Extract page with default
        limit = 10 // <-- Extract limit with default
    } = req.query;

    const filter = {}; // Initialize the main filter object for the Inventory query
    const queryPage = parseInt(page, 10);
    const queryLimit = parseInt(limit, 10);
    const skip = (queryPage - 1) * queryLimit;

    // --- Basic Filters (Apply directly to Inventory query) ---
    if (productId) {
        if (!mongoose.Types.ObjectId.isValid(productId)) { res.status(400); throw new Error('Invalid Product ID'); }
        filter.product = productId;
    }
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) { res.status(400); throw new Error('Invalid Location ID'); }
        filter.location = locationId;
    }
    if (lowStock === 'true') {
        // Find where current quantity is less than or equal to the notifyAt threshold
        filter.$expr = { $lte: ['$quantity', '$notifyAt'] };
    }

    // --- Authorization Filtering (Apply location restrictions) ---
    let accessibleLocations = null;
    if (req.user.role !== 'admin') {
        if (!req.user.locations || req.user.locations.length === 0) {
            // User has access to no locations, return empty results immediately
            return res.json({ data: [], pagination: { total: 0, page: queryPage, pages: 0, limit: queryLimit } });
        }
        accessibleLocations = req.user.locations; // Get user's allowed locations

        // If a specific location is requested, ensure user has access
        if (locationId && !accessibleLocations.some(loc => loc.equals(locationId))) {
            res.status(403); throw new Error('Forbidden: Access denied to this location inventory');
        }
        // Apply user's location access to the main filter
        // Combine with existing location filter if present using $and or simply overwrite/add
        if (filter.location) { // locationId was provided and is accessible
            // No change needed, filter.location is already correctly set
        } else { // No specific locationId requested, filter by all accessible locations
            filter.location = { $in: accessibleLocations };
        }
    }

    // --- Apply Search Filter (if 'search' query parameter exists) ---
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' }; // Case-insensitive regex
        try {
            // Find products matching the search term (name or SKU)
            const matchedProducts = await Product.find({
                $or: [
                    { name: searchRegex },
                    { sku: searchRegex }
                    // Add other searchable product fields if needed (e.g., description)
                    // { description: searchRegex }
                ]
            }).select('_id'); // Only fetch the IDs

            const productIdsToInclude = matchedProducts.map(p => p._id);

            // If search term exists but no products match, return empty results
            if (productIdsToInclude.length === 0) {
                return res.json({
                    data: [],
                    pagination: { total: 0, page: queryPage, pages: 0, limit: queryLimit }
                });
            }

            // Add the product ID condition to the main filter
            // If filter.product already exists (from productId query), use $and to combine
            if (filter.product) {
                // We need inventory items where the product is BOTH the specific productId
                // AND in the list of products matching the search.
                // This means the specific productId MUST be in productIdsToInclude.
                 if (!productIdsToInclude.some(id => id.equals(filter.product))) {
                     // The specific product ID doesn't match the search term, so no results.
                     return res.json({ data: [], pagination: { total: 0, page: queryPage, pages: 0, limit: queryLimit } });
                 }
                 // If it does match, filter.product is already correctly set to the specific ID.
            } else {
                 // If no specific productId filter was set, filter by all products matching the search.
                 filter.product = { $in: productIdsToInclude };
            }

        } catch (error) {
            console.error("Error during product search:", error);
            res.status(500);
            throw new Error("Server error during product search");
        }
    }

    // --- Execute Query with Pagination ---
    try {
        // Get total count matching the final filter *before* applying limit/skip
        const totalItems = await Inventory.countDocuments(filter);

        // Find the inventory items matching the filter, apply sorting, skip, and limit
        const inventoryList = await Inventory.find(filter)
            .populate({ // Populate product and its category
                path: 'product',
                select: 'name sku price imageUrl isActive category', // Include category field
                populate: { // Nested populate for category name
                    path: 'category',
                    select: 'name' // Select only the name of the category
                }
            })
            .populate('location', 'name type isActive') // Populate location
            .sort({ 'location.name': 1, 'product.name': 1 }) // Default sort
            .skip(skip)
            .limit(queryLimit);

        // --- Prepare Paginated Response ---
        res.json({
            data: inventoryList, // The items for the current page
            pagination: {
                total: totalItems, // Total items matching the filter
                page: queryPage, // Current page number
                pages: Math.ceil(totalItems / queryLimit), // Total number of pages
                limit: queryLimit // Items per page
            }
        });

    } catch (error) {
         console.error("Error fetching inventory list:", error);
         res.status(500);
         throw new Error("Server error fetching inventory");
    }
});

// @desc    Get a single inventory record by ID
// @route   GET /api/inventory/:id
// @access  Authenticated User (with access to location)
const getInventoryById = asyncHandler(async (req, res) => {
     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400);
       throw new Error('Invalid Inventory ID format');
    }
    const inventoryId = req.params.id;

    const inventory = await Inventory.findById(inventoryId)
        .populate('product', 'name sku price category brand description isActive')
        .populate('location', 'name type address isActive');

    if (!inventory) {
        res.status(404); throw new Error('Inventory record not found');
    }

    // Authorization Check: User needs access to the location of this inventory item
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(inventory.location._id)) {
        res.status(403); throw new Error('Forbidden: Access denied to this inventory record');
    }

    res.json(inventory);
});


// @desc    Adjust stock quantity for a specific inventory record
// @route   PATCH /api/inventory/:id/adjust
// @access  Admin, Manager (with access to location)
const adjustInventory = asyncHandler(async (req, res) => {
    const { adjustment, note } = req.body;
    const inventoryId = req.params.id;

    if (typeof adjustment !== 'number' || adjustment === 0) {
        res.status(400); throw new Error('Adjustment must be a non-zero number');
    }
     if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
       res.status(400); throw new Error('Invalid Inventory ID format');
    }

    const inventory = await Inventory.findById(inventoryId);

    if (!inventory) {
        res.status(404); throw new Error('Inventory record not found');
    }

    // Authorization Check
     if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(inventory.location)) {
        res.status(403); throw new Error('Forbidden: You do not have permission to adjust stock at this location.');
    }

    const newQuantity = inventory.quantity + adjustment;
    if (newQuantity < 0) {
        res.status(400);
        throw new Error(`Cannot adjust stock below 0. Current: ${inventory.quantity}, Adjustment: ${adjustment}`);
    }

    // Update quantity and add audit log entry
    inventory.quantity = newQuantity;
    inventory.auditLog.push({
        user: req.user.id,
        action: 'adjustment',
        adjustment: adjustment,
        note: note || 'Manual stock adjustment',
        newQuantity: newQuantity,
        timestamp: new Date()
    });

    const updatedInventory = await inventory.save();

    // Populate for response
    const populatedInventory = await Inventory.findById(updatedInventory._id)
                                               .populate('product', 'name sku')
                                               .populate('location', 'name type');


    // Emit socket event
    if (req.io) {
      req.io.to(`location_${inventory.location.toString()}`).emit('inventoryAdjusted', populatedInventory);
      req.io.to('products').emit('inventoryUpdate', populatedInventory); // General update
    }


    res.json(populatedInventory);
});

// @desc    Get expired inventory items (Expired or expiring today, with quantity > 0)
// @route   GET /api/inventory/expired
// @access  Authenticated User (filtered by access)
const getExpiredInventory = asyncHandler(async (req, res) => {
    const { search, locationId, categoryId, status } = req.query; // Get filter params

    const now = new Date();
    // Base filter for expired items with stock
    const filter = {
        expiryDate: { $lte: now }, // Items that expired before or at this moment
        quantity: { $gt: 0 }       // Only items with positive stock
    };

    // --- Apply Status Filter ---
    if (status) {
        if (status === 'recent') {
            // Recently expired (within last 7 days)
            const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            filter.expiryDate = { $gte: sevenDaysAgo, $lte: now };
        } else if (status === 'long') {
            // Long expired (more than 7 days ago)
            const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            filter.expiryDate = { $lt: sevenDaysAgo };
        }
        // 'null' or 'all' status shows all expired items (default behavior)
    }

    // --- Apply Location Filter ---
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400); throw new Error('Invalid Location ID format');
        }
        filter.location = locationId;
    }

    // --- Authorization Filtering (Apply BEFORE search for efficiency if possible) ---
    let accessibleLocations = null;
    if (req.user.role !== 'admin') {
        if (!req.user.locations || req.user.locations.length === 0) {
            return res.json([]); // User has access to no locations
        }
        accessibleLocations = req.user.locations; // Store accessible locations

        // If a specific location was requested AND the user doesn't have access
        if (locationId && !accessibleLocations.some(loc => loc.equals(locationId))) {
             res.status(403); throw new Error('Forbidden: Access denied to this location inventory');
        }
        // Apply user's location access to the main filter if no specific location was requested OR if the requested location is accessible
         if (!locationId || (locationId && accessibleLocations.some(loc => loc.equals(locationId)))) {
            filter.location = { $in: accessibleLocations };
         }
    }

    // --- Apply Product Filters (Search, Category, Brand) ---
    let productIdsToInclude = null;
    const productFilters = {};

    // Build product filter conditions
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        productFilters.$or = [
            { name: searchRegex },
            { sku: searchRegex }
            // Add other searchable product fields if needed (e.g., barcode)
        ];
    }

    if (categoryId) {
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            res.status(400); throw new Error('Invalid Category ID format');
        }
        productFilters.category = categoryId;
    }

    // If any product filters are applied, find matching products
    if (Object.keys(productFilters).length > 0) {
        const matchedProducts = await Product.find(productFilters).select('_id');
        productIdsToInclude = matchedProducts.map(p => p._id);

        // If filters exist but no products match, return empty immediately
        if (productIdsToInclude.length === 0) {
            return res.json([]);
        }
        // Add product ID condition to the main filter
        filter.product = { $in: productIdsToInclude };
    }


    // --- Execute Query ---
    const expiredList = await Inventory.find(filter)
        // Populate necessary fields for display
        .populate({
            path: 'product',
            select: 'name sku imageUrl isActive category brand',
            populate: [
                { path: 'category', select: 'name' },
                { path: 'brand', select: 'name' }
            ]
        })
        .populate('location', 'name type isActive') // Include isActive if needed
        .sort({ expiryDate: 1 }); // Default: Recently expired first

    res.json(expiredList);
});



// @desc    Get low stock inventory items (quantity <= notifyAt)
// @route   GET /api/inventory/low-stock
// @access  Authenticated User (filtered by access)

const getLowStockInventory = asyncHandler(async (req, res) => {
    const { search, locationId } = req.query; // Get filter params

    // Base filter for low stock items
    const filter = {
        $expr: { $lte: ['$quantity', '$notifyAt'] }
    };
    // Optionally filter out items already at zero if required
    // filter.quantity = { $gt: 0 };

    // --- Apply Location Filter ---
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400); throw new Error('Invalid Location ID format');
        }
        filter.location = locationId;
    }

    // --- Authorization Filtering ---
    let accessibleLocations = null;
    if (req.user.role !== 'admin') {
        if (!req.user.locations || req.user.locations.length === 0) return res.json([]);
        accessibleLocations = req.user.locations;
        if (locationId && !accessibleLocations.some(loc => loc.equals(locationId))) {
             res.status(403); throw new Error('Forbidden: Access denied to this location inventory');
        }
         if (!locationId || (locationId && accessibleLocations.some(loc => loc.equals(locationId)))) {
            filter.location = { $in: accessibleLocations };
         }
    }

    // --- Apply Search Filter (Search Product Name/SKU) ---
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        const matchedProducts = await Product.find({ $or: [ { name: searchRegex }, { sku: searchRegex } ] }).select('_id');
        const productIdsToInclude = matchedProducts.map(p => p._id);
        if (productIdsToInclude.length === 0) return res.json([]);
         // Add product ID condition
         filter.product = { $in: productIdsToInclude };
    }

    // --- Execute Query ---
    const lowStockList = await Inventory.find(filter)
        .populate('product', 'name sku imageUrl isActive') // Populate product details
        .populate('location', 'name type isActive')      // Populate location details
        .sort({ 'location.name': 1, 'product.name': 1 }); // Sort by location, then product

    res.json(lowStockList);
});

// @desc    Get out-of-stock inventory items (with filtering)
// @route   GET /api/inventory/out-of-stock
// @access  Authenticated User (filtered by access)
const getOutOfStockInventory = asyncHandler(async (req, res) => {
    const { search, locationId } = req.query; // Get filter params

    // Base filter for out-of-stock items
    const filter = {
        quantity: { $lte: 0 } // Quantity is zero or less
    };

    // --- Apply Location Filter ---
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400); throw new Error('Invalid Location ID format');
        }
        filter.location = locationId;
    }

    // --- Authorization Filtering ---
    let accessibleLocations = null;
    if (req.user.role !== 'admin') {
        if (!req.user.locations || req.user.locations.length === 0) return res.json([]);
        accessibleLocations = req.user.locations;
        if (locationId && !accessibleLocations.some(loc => loc.equals(locationId))) {
             res.status(403); throw new Error('Forbidden: Access denied to this location inventory');
        }
        if (!locationId || (locationId && accessibleLocations.some(loc => loc.equals(locationId)))) {
           filter.location = { $in: accessibleLocations };
        }
    }

    // --- Apply Search Filter (Search Product Name/SKU) ---
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        const matchedProducts = await Product.find({ $or: [ { name: searchRegex }, { sku: searchRegex } ] }).select('_id');
        const productIdsToInclude = matchedProducts.map(p => p._id);
        if (productIdsToInclude.length === 0) return res.json([]);
        // Add product ID condition
        filter.product = { $in: productIdsToInclude };
    }

    // --- Execute Query ---
    const outOfStockList = await Inventory.find(filter)
        .populate('product', 'name sku imageUrl isActive') // Include isActive status
        .populate('location', 'name type isActive')      // Include isActive status
        .sort({ 'location.name': 1, 'product.name': 1 }); // Sort by location, then product

    res.json(outOfStockList);
});


module.exports = {
    addInventoryRecord,
    getInventory,
    getInventoryById,
    adjustInventory,
    getLowStockInventory,
    getExpiredInventory,
    getOutOfStockInventory,
};