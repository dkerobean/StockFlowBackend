const asyncHandler = require('express-async-handler');
const Location = require('../models/Location');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Create a new location
// @route   POST /api/locations
// @access  Admin, Manager
const createLocation = asyncHandler(async (req, res) => {
    const { 
        name, 
        type, 
        address, 
        contactPerson, 
        storeManager, 
        operatingHours, 
        capacity, 
        storeSize, 
        setupDate, 
        description, 
        image,
        status 
    } = req.body;

    if (!name || !type) {
        res.status(400);
        throw new Error('Location name and type are required');
    }

    // Check if location name already exists
    const locationExists = await Location.findOne({ name });
    if (locationExists) {
        res.status(400);
        throw new Error('A location with this name already exists');
    }

    // Validate contact person email if provided
    if (contactPerson?.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactPerson.email)) {
            res.status(400);
            throw new Error('Please provide a valid contact person email');
        }
    }

    const location = new Location({
        name,
        type,
        address: address || {},
        contactPerson: contactPerson || {},
        storeManager,
        operatingHours: operatingHours || {},
        storeSize,
        setupDate,
        description,
        image,
        status: status || 'operational',
        createdBy: req.user.id,
        isActive: true
    });

    const createdLocation = await location.save();
    res.status(201).json(createdLocation);
});

// @desc    Get all locations with search and filtering
// @route   GET /api/locations
// @access  Authenticated Users
const getLocations = asyncHandler(async (req, res) => {
    const { 
        search, 
        type, 
        status, 
        city, 
        region, 
        storeSize, 
        includeInactive, 
        page = 1, 
        limit = 10 
    } = req.query;

    // Build filter object
    const filter = {};

    // Search functionality
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { storeCode: { $regex: search, $options: 'i' } },
            { storeManager: { $regex: search, $options: 'i' } },
            { 'contactPerson.name': { $regex: search, $options: 'i' } },
            { 'contactPerson.email': { $regex: search, $options: 'i' } },
            { 'address.city': { $regex: search, $options: 'i' } },
            { 'address.region': { $regex: search, $options: 'i' } }
        ];
    }

    // Filter by type
    if (type) {
        filter.type = type;
    }

    // Filter by status
    if (status) {
        filter.status = status;
    }

    // Filter by city
    if (city) {
        filter['address.city'] = { $regex: city, $options: 'i' };
    }

    // Filter by region
    if (region) {
        filter['address.region'] = { $regex: region, $options: 'i' };
    }

    // Filter by store size
    if (storeSize) {
        filter.storeSize = storeSize;
    }

    // Active/Inactive filter
    if (req.user.role !== 'admin') {
        filter.isActive = true;
    } else if (includeInactive !== 'true') {
        filter.isActive = true;
    }

    const locations = await Location.find(filter)
        .populate('createdBy', 'name email')
        .sort({ name: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

    const total = await Location.countDocuments(filter);

    res.json({
        locations,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
    });
});

// @desc    Get a single location by ID
// @route   GET /api/locations/:id
// @access  Authenticated Users
const getLocationById = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('Invalid Location ID format');
    }

    const location = await Location.findById(req.params.id)
        .populate('createdBy', 'name email');

    if (!location) {
        res.status(404);
        throw new Error('Location not found');
    }

    // Non-admin users can only see active locations
    if (req.user.role !== 'admin' && !location.isActive) {
        res.status(404);
        throw new Error('Location not found');
    }

    res.json(location);
});

// @desc    Update a location
// @route   PUT /api/locations/:id
// @access  Admin, Manager
const updateLocation = asyncHandler(async (req, res) => {
    const { 
        name, 
        type, 
        address, 
        contactPerson, 
        storeManager, 
        operatingHours, 
        capacity, 
        storeSize, 
        setupDate, 
        description, 
        image, 
        status, 
        isActive 
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('Invalid Location ID format');
    }

    const location = await Location.findById(req.params.id);

    if (!location) {
        res.status(404);
        throw new Error('Location not found');
    }

    // Check for name conflict if name is being changed
    if (name && name !== location.name) {
        const locationExists = await Location.findOne({ 
            name,
            _id: { $ne: req.params.id }
        });
        if (locationExists) {
            res.status(400);
            throw new Error('Another location with this name already exists');
        }
    }

    // Validate contact person email if provided
    if (contactPerson?.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactPerson.email)) {
            res.status(400);
            throw new Error('Please provide a valid contact person email');
        }
    }

    // Update fields
    if (name) location.name = name;
    if (type) location.type = type;
    if (address) location.address = { ...location.address, ...address };
    if (contactPerson) location.contactPerson = { ...location.contactPerson, ...contactPerson };
    if (storeManager !== undefined) location.storeManager = storeManager;
    if (operatingHours) location.operatingHours = { ...location.operatingHours, ...operatingHours };
    if (storeSize !== undefined) location.storeSize = storeSize;
    if (setupDate !== undefined) location.setupDate = setupDate;
    if (description !== undefined) location.description = description;
    if (image !== undefined) location.image = image;
    if (status) location.status = status;
    if (typeof isActive === 'boolean') location.isActive = isActive;

    const updatedLocation = await location.save();
    res.json(updatedLocation);
});

// @desc    Delete a location (soft delete)
// @route   DELETE /api/locations/:id
// @access  Admin
const deleteLocation = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('Invalid Location ID format');
    }

    const location = await Location.findById(req.params.id);

    if (!location) {
        res.status(404);
        throw new Error('Location not found');
    }

    if (!location.isActive) {
        res.status(200).json({ 
            message: 'Location already inactive', 
            location 
        });
        return;
    }

    location.isActive = false;
    location.status = 'closed';
    const updatedLocation = await location.save();

    res.status(200).json({ 
        message: 'Location deactivated successfully', 
        location: updatedLocation 
    });
});

// @desc    Get location statistics
// @route   GET /api/locations/stats
// @access  Protected
const getLocationStats = asyncHandler(async (req, res) => {
    const totalLocations = await Location.countDocuments({ isActive: true });
    const activeLocations = await Location.countDocuments({ status: 'operational', isActive: true });
    const maintenanceLocations = await Location.countDocuments({ status: 'maintenance', isActive: true });
    const closedLocations = await Location.countDocuments({ status: 'closed' });

    // Locations by type
    const locationsByType = await Location.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    // Locations by region
    const locationsByRegion = await Location.aggregate([
        { $match: { isActive: true, 'address.region': { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$address.region', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // Locations by size
    const locationsBySize = await Location.aggregate([
        { $match: { isActive: true, storeSize: { $exists: true, $ne: null } } },
        { $group: { _id: '$storeSize', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    // Recent locations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentLocations = await Location.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
        isActive: true
    });

    res.json({
        totalLocations,
        activeLocations,
        maintenanceLocations,
        closedLocations,
        locationsByType,
        locationsByRegion,
        locationsBySize,
        recentLocations
    });
});

module.exports = {
    createLocation,
    getLocations,
    getLocationById,
    updateLocation,
    deleteLocation,
    getLocationStats,
};