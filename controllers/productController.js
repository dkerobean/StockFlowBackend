const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory'); // <-- Import Inventory model
const Location = require('../models/Location');   // <-- Import Location model for validation
const mongoose = require('mongoose');

// @desc    Create product definition AND optionally its initial inventory record
// @route   POST /api/products
// @access  Admin/Manager
const createProduct = asyncHandler(async (req, res) => {
    // --- Destructure ALL data from frontend ---
    const {
        name, description, sku, category, brand, price, barcode, isActive, imageUrl, // Product fields
        locationId, initialQuantity, expiryDate, minStock, notifyAt // Initial Inventory fields
    } = req.body;

    // --- Basic Product Validation ---
    if (!name || !price || !category) {
        res.status(400);
        throw new Error('Product name, price, and category are required');
    }
    if (typeof price !== 'number' || price <= 0) {
        res.status(400);
        throw new Error('Price must be a positive number');
    }
    // --- Validate SKU/Barcode Uniqueness ---
    if (sku) {
        const skuExists = await Product.findOne({ sku: sku.trim() });
        if (skuExists) {
            res.status(400);
            throw new Error('Product with this SKU already exists');
        }
    }
    if (barcode) {
        const barcodeExists = await Product.findOne({ barcode: barcode.trim() });
        if (barcodeExists) {
            res.status(400);
            throw new Error('Product with this Barcode already exists');
        }
    }

    // --- Initial Inventory Data Validation (only if provided) ---
    let validLocation = null;
    let parsedInitialQuantity = 0; // Default to 0 if not provided or invalid

    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400); throw new Error('Invalid Location ID format provided for initial stock.');
        }
        validLocation = await Location.findOne({ _id: locationId, isActive: true });
        if (!validLocation) {
            res.status(404); throw new Error(`Active Location with ID ${locationId} not found for initial stock.`);
        }

        // Validate initial quantity (allow 0, treat undefined/null as 0)
        if (initialQuantity !== undefined && initialQuantity !== null) {
            const qty = Number(initialQuantity);
            if (isNaN(qty) || qty < 0) {
                 res.status(400); throw new Error('Initial quantity must be a non-negative number.');
            }
            parsedInitialQuantity = qty;
        } else {
            parsedInitialQuantity = 0; // Explicitly set to 0 if not provided
        }
        // Don't strictly require initialQuantity > 0 here, allow creating product at location with 0 stock

    } else if (initialQuantity !== undefined || minStock !== undefined || notifyAt !== undefined || expiryDate !== undefined) {
        // If inventory details are provided *without* a locationId, it's an error
        res.status(400);
        throw new Error('A Location ID is required when providing initial stock details (quantity, minStock, etc.).');
    }


    // --- Create Product Document ---
    const product = new Product({
        name: name.trim(),
        description: description?.trim(),
        imageUrl: imageUrl || '',
        sku: sku ? sku.trim() : undefined, // Let default generator run if blank/not provided
        category, // Assuming frontend sends ObjectId
        brand: brand || undefined, // Assuming frontend sends ObjectId or null/undefined
        price,
        barcode: barcode ? barcode.trim() : undefined, // Allow sparse
        isActive: typeof isActive === 'boolean' ? isActive : true,
        createdBy: req.user.id,
        auditLog: [{ user: req.user.id, action: 'created', timestamp: new Date() }]
    });

    // --- Save Product (Consider Transactions Here for Production) ---
    const createdProduct = await product.save();

    // --- Create Initial Inventory Record (IF locationId was provided) ---
    let createdInventory = null;
    if (validLocation) { // Only if locationId was provided and validated
         const parsedMinStock = minStock !== undefined ? Number(minStock) : 5; // Default 5
         const parsedNotifyAt = notifyAt !== undefined ? Number(notifyAt) : parsedMinStock; // Default to minStock

        const inventoryData = {
            product: createdProduct._id,
            location: validLocation._id, // Use the validated location ID
            quantity: parsedInitialQuantity,
            minStock: parsedMinStock >= 0 ? parsedMinStock : 0, // Ensure non-negative
            notifyAt: parsedNotifyAt >= 0 ? parsedNotifyAt : 0, // Ensure non-negative
            expiryDate: expiryDate || null, // Allow null/undefined
            createdBy: req.user.id, // User who created the product adds the initial stock
            auditLog: [{
                user: req.user.id,
                action: 'initial_stock',
                adjustment: parsedInitialQuantity,
                note: 'Initial stock added during product creation',
                newQuantity: parsedInitialQuantity,
                timestamp: new Date()
            }]
        };

        try {
            const newInventory = new Inventory(inventoryData);
            createdInventory = await newInventory.save();

            // --- Optional: Emit socket event for inventory add ---
            if (req.io && createdInventory) {
                const populatedInventory = await Inventory.findById(createdInventory._id)
                                                        .populate('product', 'name sku')
                                                        .populate('location', 'name type');
                 if(populatedInventory){
                    req.io.to(`location_${validLocation._id.toString()}`).emit('inventoryAdded', populatedInventory);
                    req.io.to('products').emit('inventoryUpdate', populatedInventory); // General update too
                 }
            }

        } catch (inventoryError) {
            // CRITICAL: Product was saved, but inventory failed!
            // Options:
            // 1. (Best) Use a transaction to roll back product creation.
            // 2. (Okay) Log the error, potentially delete the product, return error.
            // 3. (Current) Log error, return success but add a warning message.
            console.error(`CRITICAL: Product ${createdProduct._id} created, but initial inventory record failed:`, inventoryError);
            // Decide how to respond. For now, we'll proceed but the client should be aware.
            // We could add a warning flag to the response.
            // Let's return the created product but maybe add a warning to the response object?
            // For simplicity now, we just log it. The frontend will only get the product.
            // Consider adding a specific error message or status code if this is unacceptable.
             res.status(500); // Internal server error because part of the operation failed
             throw new Error(`Product created, but failed to create initial inventory record. Please check inventory manually. Error: ${inventoryError.message}`);
        }
    }

    // --- Emit product created event ---
    if (req.io) {
      req.io.emit('productCreated', createdProduct); // Send the created product object
    }

    // --- Respond with the Created Product ---
    // Optionally include the created inventory ID or a flag indicating success/partial failure
    res.status(201).json({
        message: `Product "${createdProduct.name}" created successfully. ${createdInventory ? 'Initial inventory record added.' : 'No initial inventory specified.'}`,
        product: createdProduct,
        // inventory: createdInventory // Optionally return the inventory object too
    });
});

// @desc    Update product definition
// @route   PUT /api/products/:id
// @access  Admin/Manager
const updateProduct = asyncHandler(async (req, res) => {
     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400);
       throw new Error('Invalid Product ID format');
    }
    const productId = req.params.id;
    // imageUrl will be included in updateData if sent in the request body
    const { quantity, location, auditLog, createdBy, createdAt, updatedAt, ...updateData } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

     // Check for SKU/Barcode uniqueness if changed
    if (updateData.sku && updateData.sku !== product.sku) {
        const skuExists = await Product.findOne({ sku: updateData.sku, _id: { $ne: productId } });
        if (skuExists) {
            res.status(400); throw new Error('Another product with this SKU already exists');
        }
    }
     if (updateData.barcode && updateData.barcode !== product.barcode) {
        const barcodeExists = await Product.findOne({ barcode: updateData.barcode, _id: { $ne: productId } });
        if (barcodeExists) {
            res.status(400); throw new Error('Another product with this Barcode already exists');
        }
    }
     // Check price validity if it's being updated
     if (updateData.price !== undefined && updateData.price <= 0) {
         res.status(400); throw new Error('Price must be a positive value');
     }


    // Apply updates - Mongoose handles only updating changed fields
    // imageUrl will be updated if it exists in updateData
    Object.assign(product, updateData);

    // Add an audit log entry for the update
    // Only log if there were actual changes attempted
    if (Object.keys(updateData).length > 0) {
        product.auditLog.push({
            user: req.user.id,
            action: 'updated',
            changes: updateData, // Log what was intended to be changed
            timestamp: new Date()
        });
    }


    const updatedProduct = await product.save();

    // Emit event (updatedProduct will include imageUrl)
    if (req.io) {
      req.io.emit('productUpdated', updatedProduct);
    }

    res.json(updatedProduct);
});



// @desc    Soft delete a product (set isActive to false)
// @route   DELETE /api/products/:id
// @access  Admin
const deleteProduct = asyncHandler(async (req, res) => {
     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400);
       throw new Error('Invalid Product ID format');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }

    // Prevent deactivation if there's active inventory or pending transfers? Optional check.
    // const activeInventory = await Inventory.findOne({ product: product._id, quantity: { $gt: 0 } });
    // const pendingTransfer = await StockTransfer.findOne({ product: product._id, status: { $in: ['Pending', 'Shipped'] } });
    // if (activeInventory || pendingTransfer) {
    //     res.status(400);
    //     throw new Error('Cannot deactivate product with active stock or pending transfers.');
    // }

     if (!product.isActive) {
        res.status(200).json({ message: 'Product already inactive', product });
        return;
    }

    product.isActive = false;
    product.auditLog.push({
        user: req.user.id,
        action: 'deactivated',
        timestamp: new Date()
    });
    const updatedProduct = await product.save();

    if (req.io) {
      req.io.emit('productDeactivated', updatedProduct._id); // Send ID or object
    }

    res.status(200).json({ message: 'Product deactivated successfully', product: updatedProduct });
});

// @desc    Get product definitions
// @route   GET /api/products
// @access  Authenticated
const getProducts = asyncHandler(async (req, res) => {
    // Existing query params: category, brand, search, includeInactive, populate
    // New query param: locationId
    const { category, brand, search, includeInactive, populate, locationId } = req.query;
    const filter = {};

    if (includeInactive !== 'true') {
        filter.isActive = true;
    }

    // Existing filters
    if (category) {
        if (!mongoose.Types.ObjectId.isValid(category)) { res.status(400); throw new Error('Invalid Category ID'); }
        filter.category = category;
    }
    if (brand) {
        if (!mongoose.Types.ObjectId.isValid(brand)) { res.status(400); throw new Error('Invalid Brand ID'); }
        filter.brand = brand;
    }

    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        filter.$or = [
            { name: searchRegex },
            { description: searchRegex },
            { sku: searchRegex },
            { barcode: searchRegex }
        ];
    }

    // --- *** NEW: Location Filtering Logic *** ---
    let productIdsInLocation = null;
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400); throw new Error('Invalid Location ID format for filtering');
        }
        // Find product IDs that have an inventory record in the specified location
        // Optional: Add quantity > 0 check if you only want products *in stock* at that location
        const inventoryInLocation = await Inventory.find({
            location: locationId,
            // quantity: { $gt: 0 } // <--- Uncomment to only include products with positive stock
        }).select('product -_id'); // Select only the product field

        // Get unique product IDs
        productIdsInLocation = [...new Set(inventoryInLocation.map(inv => inv.product))];

        // If no products are found in that location, return empty array immediately
        // Or, let the main filter handle it ( $in: [] will find nothing)
        if (productIdsInLocation.length === 0) {
             return res.json([]);
        }
        // Add the product IDs condition to the main filter
        filter._id = { $in: productIdsInLocation };
    }
    // --- *** END: Location Filtering Logic *** ---


    // --- Query Execution ---
    let query = Product.find(filter);

    // Population (remains the same)
    const fieldsToPopulate = (populate || 'category,brand,createdBy').split(',');
    if (fieldsToPopulate.includes('category')) query = query.populate('category', 'name');
    if (fieldsToPopulate.includes('brand')) query = query.populate('brand', 'name');
    if (fieldsToPopulate.includes('createdBy')) query = query.populate('createdBy', 'name email');

    // Sorting (remains the same)
    query = query.sort({ name: 1 });

    const products = await query.exec();

    res.json(products);
});

const getProductById = asyncHandler(async (req, res) => {
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400);
       throw new Error('Invalid Product ID format');
    }
    const productId = req.params.id;
    const { populate } = req.query; // Get populate query param from URL

    let query = Product.findById(productId);

    // Handle population if requested
    if (populate) {
        const fieldsToPopulate = populate.split(',');
        // Add more fields here if needed for population
        if (fieldsToPopulate.includes('category')) {
           query = query.populate('category', 'name'); // Populate category name
        }
        if (fieldsToPopulate.includes('brand')) {
           query = query.populate('brand', 'name');    // Populate brand name
        }
         if (fieldsToPopulate.includes('createdBy')) {
           query = query.populate('createdBy', 'name email'); // Populate creator info
        }
        // Add other potential fields like 'updatedBy' etc. if your model has them
    }

    const product = await query.exec(); // Execute the query

    if (product) {
        res.json(product); // Send the found product
    } else {
        // If ID format is valid but product doesn't exist
        res.status(404);
        throw new Error('Product not found');
    }
});





module.exports = {
    createProduct,
    updateProduct,
    deleteProduct,
    getProducts,
    getProductById
};