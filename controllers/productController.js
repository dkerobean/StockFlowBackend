const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory'); // Needed if checking dependencies
const StockTransfer = require('../models/StockTransfer'); // Needed if checking dependencies
const mongoose = require('mongoose');

// @desc    Create product definition
// @route   POST /api/products
// @access  Admin/Manager
const createProduct = asyncHandler(async (req, res) => {
    // Destructure only core product fields, exclude stock/location fields
    const { name, description, sku, category, brand, price, barcode, isActive } = req.body;

    if (!name || !price || !category) {
        res.status(400);
        throw new Error('Product name, price, and category are required');
    }
    if (price <= 0) {
         res.status(400);
         throw new Error('Price must be a positive value');
    }

    // Check SKU uniqueness if provided
    if (sku) {
        const skuExists = await Product.findOne({ sku });
        if (skuExists) {
            res.status(400);
            throw new Error('Product with this SKU already exists');
        }
    }
    // Check Barcode uniqueness if provided
    if (barcode) {
        const barcodeExists = await Product.findOne({ barcode });
         if (barcodeExists) {
            res.status(400);
            throw new Error('Product with this Barcode already exists');
        }
    }

    const product = new Product({
        name,
        description,
        sku: sku || undefined, // Let default generator run if not provided
        category,
        brand,
        price,
        barcode,
        isActive: typeof isActive === 'boolean' ? isActive : true, // Default to active
        createdBy: req.user.id,
        auditLog: [{ // Add initial creation entry
            user: req.user.id,
            action: 'created',
            timestamp: new Date()
        }]
    });

    const createdProduct = await product.save();

    // Emit event for new product definition
    if (req.io) {
      req.io.emit('productCreated', createdProduct);
    }

    res.status(201).json(createdProduct);
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
    // Exclude fields related to inventory or that shouldn't be mass-updated here
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
     if (updateData.price <= 0) {
         res.status(400); throw new Error('Price must be a positive value');
     }


    // Apply updates - Mongoose handles only updating changed fields
    Object.assign(product, updateData);

    // Add an audit log entry for the update
    product.auditLog.push({
        user: req.user.id,
        action: 'updated',
        changes: updateData, // Log what was intended to be changed
        timestamp: new Date()
    });

    const updatedProduct = await product.save();

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
    const { category, brand, search, includeInactive } = req.query;
    const filter = {};

    // Default to only active products unless includeInactive=true is passed (for anyone)
    if (includeInactive !== 'true') {
         filter.isActive = true;
    }

    if (category) filter.category = category;
    if (brand) filter.brand = brand;

    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        filter.$or = [
            { name: searchRegex },
            { description: searchRegex },
            { sku: searchRegex },
            { barcode: searchRegex },
            { brand: searchRegex }
        ];
    }

    const products = await Product.find(filter)
        .populate('createdBy', 'name email')
        .sort({ name: 1 }); // Sort by name

    // Avoid calculating total stock here for performance. Use inventory endpoint.

    res.json(products);
});

// REMOVED adjustStock function


module.exports = {
    createProduct,
    updateProduct,
    deleteProduct,
    getProducts,
};