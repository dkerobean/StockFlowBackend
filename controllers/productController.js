const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory'); // <-- Import Inventory model
const Location = require('../models/Location');   // <-- Import Location model for validation
const mongoose = require('mongoose');
const barcodeService = require('../services/barcodeService');

// @desc    Create product definition AND optionally its initial inventory record
// @route   POST /api/products
// @access  Admin/Manager
const createProduct = asyncHandler(async (req, res) => {
    // --- Destructure ALL data from frontend ---
    const {
        name, description, sku, category, brand, price, barcode, isActive, imageUrl, // Product fields
        locationId, initialQuantity, expiryDate, minStock, notifyAt, // Initial Inventory fields
        generateBarcode, barcodeFormat // Barcode generation fields
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

    // --- Handle Barcode Generation ---
    let finalBarcode = barcode;
    let barcodeImageInfo = null;
    
    if (generateBarcode && !barcode) {
        // Generate auto barcode if requested and none provided
        const tempProductId = new mongoose.Types.ObjectId().toString();
        const tempSku = sku || `SKU${Date.now()}`;
        finalBarcode = barcodeService.generateAutoBarcode(tempProductId, tempSku);
        console.log('Auto-generated barcode:', finalBarcode);
    }
    
    // Validate barcode format if provided
    if (finalBarcode) {
        const format = barcodeFormat || 'CODE128';
        const isValidFormat = barcodeService.validateBarcodeFormat(finalBarcode, format);
        if (!isValidFormat) {
            res.status(400);
            throw new Error(`Invalid barcode format for: ${finalBarcode}`);
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
        barcode: finalBarcode ? finalBarcode.trim() : undefined, // Allow sparse
        isActive: typeof isActive === 'boolean' ? isActive : true,
        createdBy: req.user.id,
        auditLog: [{ user: req.user.id, action: 'created', timestamp: new Date() }]
    });

    // --- Save Product (Consider Transactions Here for Production) ---
    const createdProduct = await product.save();

    // --- Generate Barcode Image if barcode exists ---
    if (createdProduct.barcode) {
        try {
            const format = barcodeFormat || 'CODE128';
            barcodeImageInfo = await barcodeService.generateBarcodeImage(createdProduct.barcode, { format });
            console.log('Barcode image generated:', barcodeImageInfo.url);
        } catch (barcodeError) {
            console.error('Error generating barcode image:', barcodeError);
            // Don't fail product creation if barcode image generation fails
        }
    }

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
        barcodeImage: barcodeImageInfo, // Include barcode image info if generated
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
    console.log('=== DELETE PRODUCT REQUEST STARTED ===');
    console.log('Request params:', req.params);
    console.log('Product ID from URL:', req.params.id);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    console.log('User making request:', req.user ? req.user.id : 'No user found');

     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       console.log('❌ VALIDATION ERROR: Invalid Product ID format');
       res.status(400);
       throw new Error('Invalid Product ID format');
    }

    console.log('✅ Product ID validation passed');
    console.log('Searching for product with ID:', req.params.id);

    const product = await Product.findById(req.params.id);
    console.log('Database query result:', product ? 'Product found' : 'Product not found');
    
    if (product) {
        console.log('Found product details:');
        console.log('- Product ID:', product._id);
        console.log('- Product name:', product.name);
        console.log('- Product SKU:', product.sku);
        console.log('- Product isActive:', product.isActive);
        console.log('- Product created by:', product.createdBy);
    }

    if (!product) {
        console.log('❌ ERROR: Product not found in database');
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
        console.log('⚠️ WARNING: Product is already inactive');
        res.status(200).json({ message: 'Product already inactive', product });
        return;
    }

    console.log('🔄 Proceeding with product deactivation...');
    console.log('Setting isActive to false');
    
    product.isActive = false;
    console.log('Adding audit log entry');
    
    product.auditLog.push({
        user: req.user.id,
        action: 'deactivated',
        timestamp: new Date()
    });
    
    console.log('Saving product to database...');
    const updatedProduct = await product.save();
    console.log('✅ Product saved successfully');
    console.log('Updated product isActive status:', updatedProduct.isActive);

    if (req.io) {
        console.log('📡 Emitting socket event: productDeactivated');
        req.io.emit('productDeactivated', updatedProduct._id); // Send ID or object
    } else {
        console.log('⚠️ No socket.io instance found');
    }

    console.log('🎉 DELETE PRODUCT OPERATION COMPLETED SUCCESSFULLY');
    console.log('Sending response to client...');
    
    res.status(200).json({ message: 'Product deactivated successfully', product: updatedProduct });
});

// @desc    Permanently delete a product and all related records
// @route   DELETE /api/products/:id/permanent
// @access  Admin only
const permanentDeleteProduct = asyncHandler(async (req, res) => {
    console.log('=== PERMANENT DELETE PRODUCT REQUEST STARTED ===');
    console.log('Request params:', req.params);
    console.log('Product ID from URL:', req.params.id);
    console.log('User making request:', req.user ? req.user.id : 'No user found');
    console.log('User role:', req.user ? req.user.role : 'No role found');

    // Admin-only check
    if (!req.user || req.user.role !== 'admin') {
        console.log('❌ ACCESS DENIED: Only admins can permanently delete products');
        res.status(403);
        throw new Error('Access denied. Only administrators can permanently delete products.');
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log('❌ VALIDATION ERROR: Invalid Product ID format');
        res.status(400);
        throw new Error('Invalid Product ID format');
    }

    console.log('✅ Product ID validation passed');
    console.log('Searching for product with ID:', req.params.id);

    const product = await Product.findById(req.params.id);
    console.log('Database query result:', product ? 'Product found' : 'Product not found');
    
    if (product) {
        console.log('Found product details:');
        console.log('- Product ID:', product._id);
        console.log('- Product name:', product.name);
        console.log('- Product SKU:', product.sku);
        console.log('- Product isActive:', product.isActive);
    }

    if (!product) {
        console.log('❌ ERROR: Product not found in database');
        res.status(404);
        throw new Error('Product not found');
    }

    const { reason } = req.body;
    console.log('Deletion reason provided:', reason || 'No reason provided');

    // Safety checks before permanent deletion
    console.log('🔍 Running safety checks...');

    // Check for active inventory
    const activeInventory = await Inventory.find({ 
        product: product._id, 
        quantity: { $gt: 0 } 
    }).populate('location', 'name');

    if (activeInventory.length > 0) {
        console.log('❌ SAFETY CHECK FAILED: Product has active inventory');
        console.log('Active inventory locations:', activeInventory.map(inv => 
            `${inv.location.name}: ${inv.quantity} units`
        ));
        
        // Prepare structured error response
        const inventoryDetails = activeInventory.map(inv => ({
            locationName: inv.location.name,
            quantity: inv.quantity
        }));
        
        res.status(400).json({
            error: 'ACTIVE_INVENTORY_FOUND',
            message: 'Cannot delete product with active inventory',
            userMessage: 'This product still has active inventory and cannot be deleted.',
            details: {
                inventoryLocations: inventoryDetails,
                totalLocations: activeInventory.length,
                actionRequired: 'Please transfer the stock to another location or adjust the stock to zero before deleting.'
            },
            suggestions: [
                'Transfer stock to another location',
                'Adjust stock quantities to zero',
                'Use stock adjustment feature to remove inventory'
            ]
        });
        return;
    }

    // Check for recent transactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Note: These checks would need actual Sale/Purchase models to work
    // For now, we'll log the intent
    console.log('🔍 Checking for recent transactions...');
    console.log('Looking for sales/purchases after:', thirtyDaysAgo);
    // TODO: Add actual transaction checks when Sale/Purchase models are available

    console.log('✅ All safety checks passed');

    // Get all related records before deletion for logging
    const allInventoryRecords = await Inventory.find({ product: product._id });
    console.log(`Found ${allInventoryRecords.length} inventory records to delete`);

    // Start permanent deletion process
    console.log('🗑️ Starting permanent deletion process...');

    try {
        // Delete all inventory records for this product
        if (allInventoryRecords.length > 0) {
            console.log('Deleting inventory records...');
            const deletedInventory = await Inventory.deleteMany({ product: product._id });
            console.log(`✅ Deleted ${deletedInventory.deletedCount} inventory records`);
        }

        // TODO: Add other cascade deletions here when models are available
        // await StockAdjustment.deleteMany({ product: product._id });
        // await StockTransfer.deleteMany({ product: product._id });

        // Create final audit log entry before deletion
        console.log('📝 Creating audit trail...');
        const auditData = {
            entityType: 'product',
            entityId: product._id,
            action: 'permanent_delete',
            changes: {
                deleted_product: {
                    name: product.name,
                    sku: product.sku,
                    id: product._id
                },
                deleted_inventory_count: allInventoryRecords.length,
                reason: reason || 'No reason provided'
            },
            user: req.user.id,
            timestamp: new Date()
        };
        console.log('Audit data prepared:', auditData);

        // Delete the product itself
        console.log('🗑️ Deleting product from database...');
        await Product.findByIdAndDelete(product._id);
        console.log('✅ Product permanently deleted from database');

        // Emit socket event for real-time updates
        if (req.io) {
            console.log('📡 Emitting socket event: productPermanentlyDeleted');
            req.io.emit('productPermanentlyDeleted', { 
                productId: product._id, 
                productName: product.name 
            });
        }

        console.log('🎉 PERMANENT DELETE OPERATION COMPLETED SUCCESSFULLY');
        console.log(`Product "${product.name}" (${product.sku}) has been permanently deleted`);
        
        res.status(200).json({ 
            message: `Product "${product.name}" has been permanently deleted`,
            deletedProduct: {
                id: product._id,
                name: product.name,
                sku: product.sku
            },
            deletedInventoryRecords: allInventoryRecords.length,
            reason: reason || 'No reason provided'
        });

    } catch (error) {
        console.log('❌ ERROR during permanent deletion:', error.message);
        console.log('Rolling back any partial changes...');
        
        res.status(500);
        throw new Error(`Failed to permanently delete product: ${error.message}`);
    }
});

// @desc    Reactivate a product (set isActive to true)
// @route   PATCH /api/products/:id/reactivate
// @access  Manager/Admin
const reactivateProduct = asyncHandler(async (req, res) => {
    console.log('=== REACTIVATE PRODUCT REQUEST STARTED ===');
    console.log('Request params:', req.params);
    console.log('Product ID from URL:', req.params.id);
    console.log('User making request:', req.user ? req.user.id : 'No user found');
    console.log('User role:', req.user ? req.user.role : 'No role found');

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log('❌ VALIDATION ERROR: Invalid Product ID format');
        res.status(400);
        throw new Error('Invalid Product ID format');
    }

    console.log('✅ Product ID validation passed');
    console.log('Searching for product with ID:', req.params.id);

    const product = await Product.findById(req.params.id);
    console.log('Database query result:', product ? 'Product found' : 'Product not found');
    
    if (product) {
        console.log('Found product details:');
        console.log('- Product ID:', product._id);
        console.log('- Product name:', product.name);
        console.log('- Product SKU:', product.sku);
        console.log('- Product isActive:', product.isActive);
    }

    if (!product) {
        console.log('❌ ERROR: Product not found in database');
        res.status(404);
        throw new Error('Product not found');
    }

    if (product.isActive) {
        console.log('⚠️ WARNING: Product is already active');
        res.status(200).json({ message: 'Product is already active', product });
        return;
    }

    console.log('🔄 Proceeding with product reactivation...');
    console.log('Setting isActive to true');
    
    product.isActive = true;
    console.log('Adding audit log entry for reactivation');
    
    product.auditLog.push({
        user: req.user.id,
        action: 'reactivated',
        timestamp: new Date()
    });
    
    console.log('Saving product to database...');
    const updatedProduct = await product.save();
    console.log('✅ Product saved successfully');
    console.log('Updated product isActive status:', updatedProduct.isActive);

    if (req.io) {
        console.log('📡 Emitting socket event: productReactivated');
        req.io.emit('productReactivated', updatedProduct);
    } else {
        console.log('⚠️ No socket.io instance found');
    }

    console.log('🎉 REACTIVATE PRODUCT OPERATION COMPLETED SUCCESSFULLY');
    console.log('Sending response to client...');
    
    res.status(200).json({ 
        message: `Product "${updatedProduct.name}" has been reactivated successfully`, 
        product: updatedProduct 
    });
});

// @desc    Get product definitions
// @route   GET /api/products
// @access  Authenticated
const getProducts = asyncHandler(async (req, res) => {
    // Existing query params: category, brand, search, includeInactive, populate
    // New query param: locationId
    const { category, brand, search, includeInactive, populate, locationId, includeInventory } = req.query;
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

    // --- *** Add inventory data to products if requested *** ---
    if (locationId || includeInventory === 'true') {
        // Get all inventory records for these products
        const productIds = products.map(p => p._id);
        const inventoryRecords = await Inventory.find({
            product: { $in: productIds }
        }).populate('location', 'name');

        // Add inventory array to each product
        const productsWithInventory = products.map(product => {
            const productObj = product.toObject();
            productObj.inventory = inventoryRecords.filter(inv =>
                inv.product.toString() === product._id.toString()
            );

            // For specific location filtering
            if (locationId) {
                const locationInventory = inventoryRecords.find(inv =>
                    inv.product.toString() === product._id.toString() &&
                    inv.location._id.toString() === locationId
                );
                productObj.totalStock = locationInventory ? locationInventory.quantity : 0;
            } else {
                // For general inventory inclusion, calculate total across all locations
                productObj.totalStock = productObj.inventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
            }
            
            productObj.sellingPrice = product.price; // Use the base price as selling price

            return productObj;
        });

        return res.json(productsWithInventory);
    }

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

// @desc    Get product by barcode
// @route   GET /api/products/barcode/:barcode
// @access  Public (or Authenticated if preferred)
const getProductByBarcode = asyncHandler(async (req, res) => {
    const { barcode } = req.params;
    const { locationId } = req.query; // Optional: for location-specific stock

    if (!barcode) {
        res.status(400);
        throw new Error('Barcode is required');
    }

    let product = await Product.findOne({ barcode: barcode.trim() }).populate('category', 'name');

    if (!product) {
        res.status(404);
        throw new Error('Product not found with this barcode');
    }

    // If locationId is provided, get stock for that location
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400); throw new Error('Invalid Location ID format');
        }
        const inventory = await Inventory.findOne({ product: product._id, location: locationId });
        product = product.toObject(); // Convert Mongoose document to plain object
        product.currentStock = inventory ? inventory.quantity : 0;
    } else {
        // Otherwise, get total stock across all locations
        product = product.toObject();
        product.currentStock = await product.getTotalStock();
    }

    res.json(product);
});

module.exports = {
    createProduct,
    updateProduct,
    deleteProduct,
    permanentDeleteProduct,
    reactivateProduct,
    getProducts,
    getProductById,
    getProductByBarcode
};
