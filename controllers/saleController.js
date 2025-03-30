const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory'); // Import Inventory
const Location = require('../models/Location'); // Import Location
const mongoose = require('mongoose');
// const { emitNewSale } = require('../socket'); // Keep if you use this pattern

// Helper function to validate sale items against inventory at a specific location
async function validateSaleItems(items, locationId) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('Sale must contain at least one item');
    }
     if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) {
        throw new Error('Valid location ID is required for sale validation');
     }

     const location = await Location.findOne({_id: locationId, isActive: true});
     if (!location) throw new Error(`Active location with ID ${locationId} not found.`);


    for (const item of items) {
        if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
            throw new Error(`Invalid product ID found in items.`);
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
             throw new Error(`Invalid quantity for product ID ${item.product}.`);
        }
         if (typeof item.price !== 'number' || item.price <= 0) {
            throw new Error(`Invalid price for product ID ${item.product}.`);
        }

        const product = await Product.findById(item.product);
        if (!product || !product.isActive) {
            throw new Error(`Active product ${item.product} not found`);
        }

        // *** Check inventory at the SPECIFIC location ***
        const inventory = await Inventory.findOne({
            product: item.product,
            location: locationId
        });

        if (!inventory || inventory.quantity < item.quantity) {
            throw new Error(`Insufficient stock for ${product.name} at ${location.name}. Available: ${inventory?.quantity || 0}`);
        }
    }
}


// @desc    Create a new sale
// @route   POST /api/sales
// @access  Staff+ (with location access)
const createSale = asyncHandler(async (req, res) => {
    // Get locationId (as ObjectId) instead of enum string
    const { items, paymentMethod, customer, locationId, notes, tax, discount } = req.body;

    if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) {
        res.status(400);
        throw new Error('Valid Location ID (locationId) is required');
    }
     if (!paymentMethod) {
        res.status(400); throw new Error('Payment method is required');
     }

    // Authorization check (Middleware `hasLocationAccess` should handle this)
    // if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(locationId)) {
    //    res.status(403); throw new Error('Forbidden: Access denied to create sales at this location.');
    // }

    // *** Call the updated validation helper ***
    await validateSaleItems(items, locationId);

    const sale = new Sale({
        items,
        paymentMethod,
        customer: customer || undefined,
        location: locationId, // Store the ObjectId
        notes,
        tax: tax || 0,
        discount: discount || 0, // Overall sale discount
        createdBy: req.user.id
        // subtotal and total are calculated by pre-save hook
    });

    // The pre-validate/pre-save hooks in Sale model handle calculations
    const createdSale = await sale.save();

    // The post-save hook handles inventory update and income creation

    // Populate necessary fields for response
     const populatedSale = await Sale.findById(createdSale._id)
        .populate('items.product', 'name sku barcode')
        .populate('location', 'name type')
        .populate('createdBy', 'name email');


    // Emit real-time updates (using req.io or global io)
    if (req.io) {
      req.io.to('sales').to(`location_${locationId}`).emit('newSale', populatedSale);
      // Inventory updates are now triggered by the post-save hook's emits
    }
    // emitNewSale(populatedSale); // Use your existing pattern if preferred


    res.status(201).json(populatedSale);
});

// @desc    Get all sales
// @route   GET /api/sales
// @access  Manager+ (filtered by access)
const getSales = asyncHandler(async (req, res) => {
    const { startDate, endDate, locationId } = req.query; // Use locationId
    const filter = {};

    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999)); // Include whole end day
    }

    if (locationId) {
         if (!mongoose.Types.ObjectId.isValid(locationId)) {res.status(400); throw new Error('Invalid Location ID');}
         filter.location = locationId;
    }

    // Authorization Filtering: Admins see all. Managers see sales only for their locations.
    if (req.user.role !== 'admin') {
         if (!req.user.locations || req.user.locations.length === 0) {
            return res.json([]); // Manager has access to no locations
         }
         // If a specific location was requested, ensure they have access
         if (locationId && !req.user.hasAccessToLocation(locationId)) {
             res.status(403); throw new Error('Forbidden: Access denied to sales for this location.');
         }
         // If no specific location requested, filter by their accessible locations
         else if (!locationId) {
            filter.location = { $in: req.user.locations };
         }
    }


    const sales = await Sale.find(filter)
        .populate('items.product', 'name sku price barcode') // Keep populating item details
        .populate('location', 'name type') // Populate location details
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });

    res.json(sales);
});

// @desc    Get sale by ID
// @route   GET /api/sales/:id
// @access  Staff+ (with location access)
const getSale = asyncHandler(async (req, res) => {
     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       res.status(400); throw new Error('Invalid Sale ID format');
    }

    const sale = await Sale.findById(req.params.id)
        .populate('items.product', 'name price barcode sku')
        .populate('location', 'name type address') // Populate location
        .populate('createdBy', 'name email');

    if (!sale) {
        res.status(404);
        throw new Error('Sale not found');
    }

    // Authorization check: Admin or user with access to the sale's location
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(sale.location._id)) {
       res.status(403);
       throw new Error('Forbidden: You do not have access to view this sale.');
    }


    res.json(sale);
});


module.exports = {
    createSale,
    getSales,
    getSale,
    // No longer need the helper exposed if it's internal
};