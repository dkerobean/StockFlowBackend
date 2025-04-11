const Category = require('../models/Category');
const User = require('../models/User');

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private (Manager or Admin)
exports.createCategory = async (req, res) => {
    const { name } = req.body;
    const userId = req.user?._id;

    if (!name) {
        return res.status(400).json({ message: 'Category name is required' });
    }

    try {
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ message: 'Category already exists' });
        }

        const category = new Category({
            name,
            createdBy: userId,
        });

        const createdCategory = await category.save();
        res.status(201).json(createdCategory);
    } catch (error) {
        console.error('Error creating category:', error);
        if (error.code === 11000) {
             return res.status(400).json({ message: 'Category already exists' });
        }
        res.status(500).json({ message: 'Server error creating category' });
    }
};

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private (Authenticated User)
exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find({}).sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Server error fetching categories' });
    }
};

// @desc    Get single category by ID
// @route   GET /api/categories/:id
// @access  Private (Authenticated User)
exports.getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (category) {
            res.json(category);
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        console.error('Error fetching category by ID:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(500).json({ message: 'Server error fetching category' });
    }
};


// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private (Manager or Admin)
exports.updateCategory = async (req, res) => {
    const { name } = req.body;

    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

         if (name && name !== category.name) {
             const existingCategory = await Category.findOne({ name, _id: { $ne: req.params.id } });
             if (existingCategory) {
                 return res.status(400).json({ message: 'Another category with this name already exists' });
             }
             category.name = name;
         }

        const updatedCategory = await category.save();
        res.json(updatedCategory);

    } catch (error) {
        console.error('Error updating category:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Category not found' });
        }
        if (error.code === 11000) {
             return res.status(400).json({ message: 'Another category with this name already exists' });
        }
        res.status(500).json({ message: 'Server error updating category' });
    }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private (Admin)
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Optional: Check if any products are using this category before deleting
        // const productsUsingCategory = await Product.countDocuments({ category: req.params.id });
        // if (productsUsingCategory > 0) {
        //     return res.status(400).json({ message: 'Cannot delete category, it is currently associated with products.' });
        // }

        await category.deleteOne();
        res.json({ message: 'Category removed' });

    } catch (error) {
        console.error('Error deleting category:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.status(500).json({ message: 'Server error deleting category' });
    }
};