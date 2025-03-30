const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin, hasLocationAccess } = require('../middleware/authJwt'); // Assuming hasLocationAccess exists
const locationController = require('../controllers/locationController');

// Create Location
router.post('/', verifyToken, isManagerOrAdmin, locationController.createLocation);

// Get All Locations (active by default)
router.get('/', verifyToken, locationController.getLocations);

// Get Single Location
router.get('/:id', verifyToken, locationController.getLocationById);

// Update Location (Manager needs access to the specific location being updated)
router.put('/:id', verifyToken, isManagerOrAdmin, hasLocationAccess('id'), locationController.updateLocation); // Use hasLocationAccess middleware

// Soft Delete Location
router.delete('/:id', verifyToken, isAdmin, locationController.deleteLocation);

module.exports = router;