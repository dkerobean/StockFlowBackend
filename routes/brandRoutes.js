const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isManagerOrAdmin } = require('../middleware/authJwt'); // Adjust path if needed
const brandController = require('../controllers/brandController');


// Create Brand
router.post('/', verifyToken, isManagerOrAdmin, brandController.createBrand);

// Get all Brands
router.get('/', verifyToken, brandController.getBrands);

// Get single Brand
router.get('/:id', verifyToken, brandController.getBrandById);

// Update Brand
router.put('/:id', verifyToken, isManagerOrAdmin, brandController.updateBrand);

// Delete Brand
router.delete('/:id', verifyToken, isAdmin, brandController.deleteBrand);

module.exports = router;