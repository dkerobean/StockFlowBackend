const asyncHandler = require('express-async-handler');
const Location = require('../models/Location');
const User = require('../models/User'); // If needed for specific checks, though middleware handles most
const mongoose = require('mongoose');

// @desc    Create a new location
// @route   POST /api/locations
// @access  Admin, Manager
const createLocation = asyncHandler(async (req, res) => {
    const { name, type, address } = req.body;

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

    const location = new Location({
        name,
        type,
        address: address || undefined,
        createdBy: req.user.id,
        isActive: true // Explicitly set active on creation
    });

    const createdLocation = await location.save();
    res.status(201).json(createdLocation);
});

// @desc    Get all active locations (or all for admin)
// @route   GET /api/locations
// @access  Authenticated Users
const getLocations = asyncHandler(async (req, res) => {
    const filter = {};
    // Non-admins only see active locations by default
    if (req.user.role !== 'admin') {
        filter.isActive = true;
    } else if (req.query.includeInactive === 'true') {
        // Admin can explicitly request inactive ones too
    } else {
        filter.isActive = true; // Default for admin is also active unless specified
    }

     if (req.query.type) {
        filter.type = req.query.type;
     }

    const locations = await Location.find(filter)
                                   .populate('createdBy', 'name email')
                                   .sort({ name: 1 });
    res.json(locations);
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

    // Optional: Add check if non-admin should only see active locations here too
    if (req.user.role !== 'admin' && !location.isActive) {
        res.status(404); // Treat inactive as not found for non-admins
        throw new Error('Location not found');
    }

    res.json(location);
});

// @desc    Update a location
// @route   PUT /api/locations/:id
// @access  Admin, Manager (with access)
const updateLocation = asyncHandler(async (req, res) => {
    const { name, type, address, isActive } = req.body;

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
        const locationExists = await Location.findOne({ name });
        if (locationExists && locationExists._id.toString() !== location._id.toString()) {
            res.status(400);
            throw new Error('Another location with this name already exists');
        }
        location.name = name;
    }

    if (type) location.type = type;
    if (address) location.address = address;
    // Only allow changing isActive if the field is explicitly provided
    if (typeof isActive === 'boolean') {
        location.isActive = isActive;
    }

    const updatedLocation = await location.save();
    res.json(updatedLocation);
});

// @desc    Soft delete a location (set isActive to false)
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
        // Already inactive, maybe just return success?
         res.status(200).json({ message: 'Location already inactive', location });
         return;
    }

    location.isActive = false;
    const updatedLocation = await location.save();

    // Consider implications: What about inventory at this location? Transfers to/from?
    // This simple soft delete doesn't cascade.

    res.status(200).json({ message: 'Location deactivated successfully', location: updatedLocation });
});


module.exports = {
    createLocation,
    getLocations,
    getLocationById,
    updateLocation,
    deleteLocation,
};