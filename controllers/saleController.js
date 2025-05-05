const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory'); // Import Inventory
const Location = require('../models/Location'); // Import Location
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice'); // Import Invoice
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
            const productName = product.name || 'Unknown Product';
            const locationName = location.name || 'Unknown Location';
            const availableQuantity = inventory?.quantity || 0;
            throw new Error(`Insufficient stock for ${productName} at ${locationName}. Available: ${availableQuantity}`);
        }
    }
}


// @desc    Create a new sale
// @route   POST /api/sales
// @access  Staff+ (with location access)
const createSale = asyncHandler(async (req, res) => {
    const {
        customer,
        items,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        location,
        notes
    } = req.body;

    const sale = new Sale({
        customer,
        items,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        location,
        createdBy: req.user._id,
        notes
    });

    const createdSale = await sale.save();

    // Create invoice for the sale
    const invoice = new Invoice({
        sale: createdSale._id,
        customer: createdSale.customer,
        items: createdSale.items.map(item => ({
            product: item.product,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            total: item.price * item.quantity * (1 - item.discount / 100)
        })),
        subtotal: createdSale.subtotal,
        tax: createdSale.tax,
        discount: createdSale.discount,
        total: createdSale.total,
        status: 'Paid',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        paymentMethod: createdSale.paymentMethod,
        location: createdSale.location,
        createdBy: createdSale.createdBy,
        notes: createdSale.notes
    });

    await invoice.save();

    res.status(201).json(createdSale);
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
        .populate('items.product', 'name sku price barcode imageUrl') // Include imageUrl
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

const updateSale = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updatedData = { ...req.body };

    // Handle customer name update separately
    if (updatedData.customer && updatedData.customer.name) {
        updatedData['customer.name'] = updatedData.customer.name;
        delete updatedData.customer;
    }

    const sale = await Sale.findByIdAndUpdate(
        id,
        { $set: updatedData },
        { new: true, runValidators: true }
    )
    .populate('items.product', 'name sku barcode imageUrl')
    .populate('location', 'name type')
    .populate('createdBy', 'name email');

    if (!sale) {
        res.status(404);
        throw new Error('Sale not found');
    }

    res.json(sale);
});

// @desc    Delete a sale
// @route   DELETE /api/sales/:id
// @access  Manager+ (with location access)
const deleteSale = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid Sale ID format');
    }

    const sale = await Sale.findById(id).populate('location', '_id');

    if (!sale) {
        res.status(404);
        throw new Error('Sale not found');
    }

    // Authorization check: Admin or user with access to the sale's location
    if (req.user.role !== 'admin' && !req.user.hasAccessToLocation(sale.location._id)) {
        res.status(403);
        throw new Error('Forbidden: You do not have access to delete this sale.');
    }

    try {
        // Use deleteOne() instead of remove()
        await Sale.deleteOne({ _id: id });

        // Emit socket event for sale deletion
        if (req.io) {
            req.io.to('sales').to(`location_${sale.location._id.toString()}`).emit('saleDeleted', { saleId: id });
        }

        res.json({ message: 'Sale deleted successfully', saleId: id });
    } catch (error) {
        console.error(`Error during sale deletion process for ${id}:`, error);
        res.status(500);
        throw new Error(error.message || 'Failed to delete sale due to an internal error.');
    }
});

module.exports = {
    createSale,
    getSales,
    getSale,
    updateSale,
    deleteSale
};
