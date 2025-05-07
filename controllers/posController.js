const POS = require('../models/POS');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const { validateObjectId } = require('../utils/validation');

// Helper function to validate POS items
async function validatePOSItems(items, locationId) {
    const errors = [];

    for (const item of items) {
        // Validate product exists
        if (!validateObjectId(item.product)) {
            errors.push(`Invalid product ID: ${item.product}`);
            continue;
        }

        const product = await Product.findById(item.product);
        if (!product) {
            errors.push(`Product not found: ${item.product}`);
            continue;
        }

        // Validate inventory
        const inventory = await Inventory.findOne({
            product: item.product,
            location: locationId
        });

        if (!inventory) {
            errors.push(`Product ${product.name} not available at this location`);
            continue;
        }

        if (inventory.quantity < item.quantity) {
            errors.push(`Insufficient stock for ${product.name}. Available: ${inventory.quantity}`);
        }
    }

    return errors;
}

// Create a new POS sale
exports.createPOS = async (req, res) => {
    try {
        const { items, paymentMethod, customer, location, notes } = req.body;

        // Validate required fields
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'At least one item is required' });
        }

        if (!paymentMethod) {
            return res.status(400).json({ message: 'Payment method is required' });
        }

        if (!location) {
            return res.status(400).json({ message: 'Location is required' });
        }

        // Validate items and inventory
        const errors = await validatePOSItems(items, location);
        if (errors.length > 0) {
            return res.status(400).json({ message: 'Validation failed', errors });
        }

        // Create POS sale
        const pos = new POS({
            items,
            paymentMethod,
            customer,
            location,
            notes,
            createdBy: req.user._id
        });

        await pos.save();

        res.status(201).json({
            message: 'POS sale created successfully',
            data: pos
        });
    } catch (error) {
        console.error('Error creating POS sale:', error);
        res.status(500).json({ message: 'Error creating POS sale', error: error.message });
    }
};

// Get all POS sales
exports.getAllPOS = async (req, res) => {
    try {
        const { location, startDate, endDate, status } = req.query;
        const query = {};

        if (location) query.location = location;
        if (status) query.status = status;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const pos = await POS.find(query)
            .populate('items.product', 'name sku price')
            .populate('location', 'name')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.json({
            message: 'POS sales retrieved successfully',
            data: pos
        });
    } catch (error) {
        console.error('Error retrieving POS sales:', error);
        res.status(500).json({ message: 'Error retrieving POS sales', error: error.message });
    }
};

// Get a single POS sale
exports.getPOS = async (req, res) => {
    try {
        const pos = await POS.findById(req.params.id)
            .populate('items.product', 'name sku price')
            .populate('location', 'name')
            .populate('createdBy', 'name');

        if (!pos) {
            return res.status(404).json({ message: 'POS sale not found' });
        }

        res.json({
            message: 'POS sale retrieved successfully',
            data: pos
        });
    } catch (error) {
        console.error('Error retrieving POS sale:', error);
        res.status(500).json({ message: 'Error retrieving POS sale', error: error.message });
    }
};

// Update POS sale status
exports.updatePOSStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const pos = await POS.findById(req.params.id);

        if (!pos) {
            return res.status(404).json({ message: 'POS sale not found' });
        }

        // Only allow status updates
        pos.status = status;
        await pos.save();

        res.json({
            message: 'POS sale status updated successfully',
            data: pos
        });
    } catch (error) {
        console.error('Error updating POS sale status:', error);
        res.status(500).json({ message: 'Error updating POS sale status', error: error.message });
    }
};

// Get POS statistics
exports.getPOSStats = async (req, res) => {
    try {
        const { location, startDate, endDate } = req.query;
        const match = { status: 'completed' };

        if (location) match.location = location;
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        const stats = await POS.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: '$total' },
                    totalTransactions: { $sum: 1 },
                    averageSale: { $avg: '$total' }
                }
            }
        ]);

        res.json({
            message: 'POS statistics retrieved successfully',
            data: stats[0] || { totalSales: 0, totalTransactions: 0, averageSale: 0 }
        });
    } catch (error) {
        console.error('Error retrieving POS statistics:', error);
        res.status(500).json({ message: 'Error retrieving POS statistics', error: error.message });
    }
};