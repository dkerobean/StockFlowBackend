const User = require('../models/User');
const Location = require('../models/Location'); // Needed for validating locations on register
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Register user
exports.register = async (req, res) => {
    try {
        const { name, email, password, role, locations } = req.body; // Added locations

        // Basic validation
        if (!name || !email || !password) {
             return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
        }

        // Optional: Validate provided locations if any
        let validLocationIds = [];
        if (locations && Array.isArray(locations) && locations.length > 0) {
             // Ensure only admin/manager can assign locations on register? Or maybe admin only?
             // Let's assume for now an Admin is performing registration if locations are provided.
             // Add role check middleware to the register route if needed.
            const foundLocations = await Location.find({
                 _id: { $in: locations },
                 isActive: true
             }).select('_id'); // Only get IDs

            validLocationIds = foundLocations.map(loc => loc._id);

            if (validLocationIds.length !== locations.length) {
                // Find which ones were invalid/inactive
                const invalidIds = locations.filter(id => !validLocationIds.some(validId => validId.equals(id)));
                console.warn('Invalid or inactive location IDs provided during registration:', invalidIds);
                // Decide: Reject registration or just ignore invalid ones? Let's ignore invalid.
                // return res.status(400).json({ success: false, error: `Invalid or inactive location IDs provided: ${invalidIds.join(', ')}`});
            }
        }


        const user = await User.create({
            name,
            email,
            password, // Will be auto-hashed
            role: role || 'staff',
            locations: validLocationIds // Assign validated location IDs
        });

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role, locations: user.locations }, // Include locations in token? Optional.
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // --- Populate locations for the response ---
        const userToSend = await User.findById(user._id)
                                    .populate('locations', 'name type _id isActive') // Populate details
                                    .select('-password'); // Exclude password


        res.status(201).json({
            success: true,
            token,
            user: userToSend
        });
    } catch (err) {
        // Handle duplicate email error specifically
        if (err.code === 11000) {
             return res.status(400).json({ success: false, error: 'Email address already in use.' });
        }
        res.status(400).json({
            success: false,
            error: err.message || 'User registration failed.'
        });
    }
};

// Login user
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
             return res.status(400).json({ success: false, error: 'Please provide email and password.' });
        }

        // Find user and explicitly select password, then populate locations
        const user = await User.findOne({ email })
                              .select('+password')
                              .populate('locations', 'name type _id isActive'); // Populate locations

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

         if (!user.active) {
             return res.status(403).json({ success: false, error: 'Your account is inactive. Please contact an administrator.' });
         }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role, locations: user.locations.map(l => l._id) }, // Send IDs in token payload
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Update last login
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false }); // Skip validation on login update

        // Omit password in response
        const userResponse = user.toObject();
        delete userResponse.password;
        // locations are already populated

        res.status(200).json({
            success: true,
            token,
            user: userResponse // Send user object with populated locations
        });
    } catch (err) {
        console.error("Login Error:", err); // Log server error
        res.status(500).json({ // Use 500 for unexpected server errors
            success: false,
            error: 'Login failed due to a server error.'
        });
    }
};