const Brand = require('../models/Brand');
const User = require('../models/User'); // Assuming you have a User model

// @desc    Create a new brand
// @route   POST /api/brands
// @access  Private (Manager or Admin)
exports.createBrand = async (req, res) => {
    const { name } = req.body;
    const userId = req.userId; // Added by verifyToken middleware

    if (!name) {
        return res.status(400).json({ message: 'Brand name is required' });
    }

    try {
        const existingBrand = await Brand.findOne({ name });
        if (existingBrand) {
            return res.status(400).json({ message: 'Brand already exists' });
        }

        const brand = new Brand({
            name,
            createdBy: userId,
        });

        const createdBrand = await brand.save();
        res.status(201).json(createdBrand);
    } catch (error) {
        console.error('Error creating brand:', error);
        if (error.code === 11000) { // Handle potential race condition for unique index
             return res.status(400).json({ message: 'Brand already exists' });
        }
        res.status(500).json({ message: 'Server error creating brand' });
    }
};

// @desc    Get all brands
// @route   GET /api/brands
// @access  Private (Authenticated User)
exports.getBrands = async (req, res) => {
    try {
        const brands = await Brand.find({}).sort({ name: 1 }); // Sort alphabetically
        res.json(brands);
    } catch (error) {
        console.error('Error fetching brands:', error);
        res.status(500).json({ message: 'Server error fetching brands' });
    }
};

// @desc    Get single brand by ID
// @route   GET /api/brands/:id
// @access  Private (Authenticated User)
exports.getBrandById = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);

        if (brand) {
            res.json(brand);
        } else {
            res.status(404).json({ message: 'Brand not found' });
        }
    } catch (error) {
        console.error('Error fetching brand by ID:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Brand not found' });
        }
        res.status(500).json({ message: 'Server error fetching brand' });
    }
};


// @desc    Update a brand
// @route   PUT /api/brands/:id
// @access  Private (Manager or Admin)
exports.updateBrand = async (req, res) => {
    const { name } = req.body;

    try {
        const brand = await Brand.findById(req.params.id);

        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        // Optional: Check for duplicate name on update, excluding the current document
        if (name && name !== brand.name) {
             const existingBrand = await Brand.findOne({ name, _id: { $ne: req.params.id } });
             if (existingBrand) {
                 return res.status(400).json({ message: 'Another brand with this name already exists' });
             }
             brand.name = name;
        }


        const updatedBrand = await brand.save();
        res.json(updatedBrand);

    } catch (error) {
        console.error('Error updating brand:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Brand not found' });
        }
        if (error.code === 11000) {
             return res.status(400).json({ message: 'Another brand with this name already exists' });
        }
        res.status(500).json({ message: 'Server error updating brand' });
    }
};

// @desc    Delete a brand
// @route   DELETE /api/brands/:id
// @access  Private (Admin)
exports.deleteBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);

        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        // Optional: Check if any products are using this brand before deleting
        // const productsUsingBrand = await Product.countDocuments({ brand: req.params.id });
        // if (productsUsingBrand > 0) {
        //     return res.status(400).json({ message: 'Cannot delete brand, it is currently associated with products.' });
        // }

        await brand.deleteOne(); // or use .deleteOne() if you don't need the document instance
        res.json({ message: 'Brand removed' });

    } catch (error) {
        console.error('Error deleting brand:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Brand not found' });
        }
        res.status(500).json({ message: 'Server error deleting brand' });
    }
};