const IncomeCategory = require('../models/IncomeCategory');

// @desc    Create a new income category
// @route   POST /api/income-categories
// @access  Private
exports.createIncomeCategory = async (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Category name is required.' });
    }

    try {
        const existingCategory = await IncomeCategory.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ message: 'Income category with this name already exists.' });
        }

        const newCategory = new IncomeCategory({
            name,
            description,
            createdBy: req.user.id // From verifyToken middleware
        });

        const savedCategory = await newCategory.save();
        res.status(201).json(savedCategory);

    } catch (error) {
        console.error('Error creating income category:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server error while creating income category.' });
    }
};

// @desc    Get all income categories
// @route   GET /api/income-categories
// @access  Private
exports.getAllIncomeCategories = async (req, res) => {
    try {
        const categories = await IncomeCategory.find({ /* Add filters if needed */ })
                                           .populate('createdBy', 'username email')
                                           .sort({ name: 1 });
        res.status(200).json(categories); // Send back the array directly or as { categories: categories }

    } catch (error) {
        console.error('Error fetching income categories:', error);
        res.status(500).json({ message: 'Server error while fetching income categories.' });
    }
};

// @desc    Get a single income category by ID
// @route   GET /api/income-categories/:id
// @access  Private
exports.getIncomeCategoryById = async (req, res) => {
    try {
        const category = await IncomeCategory.findById(req.params.id)
                                         .populate('createdBy', 'username email');

        if (!category) {
            return res.status(404).json({ message: 'Income category not found.' });
        }
        res.status(200).json(category);

    } catch (error) {
        console.error('Error fetching income category by ID:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Income category not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching income category.' });
    }
};

// @desc    Update an existing income category
// @route   PUT /api/income-categories/:id
// @access  Private
exports.updateIncomeCategory = async (req, res) => {
    const { name, description } = req.body;
    const categoryId = req.params.id;
    const userId = req.user.id;

    try {
        const category = await IncomeCategory.findById(categoryId);

        if (!category) {
            return res.status(404).json({ message: 'Income category not found.' });
        }

        // Optional: Check if user is authorized to update (e.g., only creator or admin)
        // if (category.createdBy.toString() !== userId && req.user.role !== 'admin') {
        //     return res.status(403).json({ message: 'User not authorized to update this category.' });
        // }

        if (name !== undefined) category.name = name;
        if (description !== undefined) category.description = description;

        const updatedCategory = await category.save();
        res.status(200).json(updatedCategory);

    } catch (error) {
        console.error('Error updating income category:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Income category not found (invalid ID format).' });
        }
        if (error.name === 'ValidationError') {
            // Check for unique name violation if name is being changed
            if (error.errors.name && error.errors.name.kind === 'unique') {
                 return res.status(400).json({ message: 'Income category with this name already exists.' });
            }
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server error while updating income category.' });
    }
};

// @desc    Delete an income category
// @route   DELETE /api/income-categories/:id
// @access  Private
exports.deleteIncomeCategory = async (req, res) => {
    const categoryId = req.params.id;
    const userId = req.user.id;

    try {
        const category = await IncomeCategory.findById(categoryId);

        if (!category) {
            return res.status(404).json({ message: 'Income category not found.' });
        }

        // Optional: Check if user is authorized to delete
        // if (category.createdBy.toString() !== userId && req.user.role !== 'admin') {
        //     return res.status(403).json({ message: 'User not authorized to delete this category.' });
        // }

        // TODO: Consider what happens to Incomes that use this category.
        // Option 1: Prevent deletion if in use.
        // Option 2: Set Incomes to a default category or nullify.
        // Option 3: Delete associated Incomes (dangerous).
        // For now, direct deletion. Add checks if needed.

        await IncomeCategory.findByIdAndDelete(categoryId);
        res.status(200).json({ message: 'Income category deleted successfully.' });

    } catch (error) {
        console.error('Error deleting income category:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Income category not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deleting income category.' });
    }
};
