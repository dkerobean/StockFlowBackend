const Income = require('../models/Income');

// @desc    Record a new income entry
// @route   POST /api/income
// @access  Private
exports.recordIncome = async (req, res) => {
    const { source, description, amount, date, notes, relatedSale } = req.body;

    // Basic validation
    if (!description || !amount) {
        return res.status(400).json({ message: 'Description and amount are required.' });
    }
    if (amount <= 0) {
         return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    try {
        const newIncome = new Income({
            source,
            description,
            amount,
            date: date || Date.now(), // Default to now if not provided
            notes,
            relatedSale: source === 'Sale' ? relatedSale : undefined, // Only include if source is 'Sale'
            createdBy: req.user.id // Assuming verifyToken middleware adds user to req
        });

        const savedIncome = await newIncome.save();
        res.status(201).json(savedIncome);

    } catch (error) {
        console.error('Error recording income:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server error while recording income.' });
    }
};

// @desc    Get all income entries (add filters/pagination later)
// @route   GET /api/income
// @access  Private
exports.getAllIncome = async (req, res) => {
    try {
        // Basic find, sort by most recent date. Add pagination/filtering as needed.
        const incomes = await Income.find({ /* add filters here if needed */ })
                                     .populate('createdBy', 'username email') // Populate user details
                                     .populate('relatedSale', 'total') // Populate sale details if needed
                                     .sort({ date: -1 });

        res.status(200).json(incomes);

    } catch (error) {
        console.error('Error fetching income:', error);
        res.status(500).json({ message: 'Server error while fetching income.' });
    }
};

// @desc    Get a single income entry by ID
// @route   GET /api/income/:id
// @access  Private
exports.getIncomeById = async (req, res) => {
    try {
        const income = await Income.findById(req.params.id)
                                    .populate('createdBy', 'username email')
                                    .populate('relatedSale');

        if (!income) {
            return res.status(404).json({ message: 'Income record not found.' });
        }

        // Optional: Check if the user requesting is the one who created it or an admin
        // if (income.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
        //     return res.status(403).json({ message: 'User not authorized to view this record.' });
        // }

        res.status(200).json(income);

    } catch (error) {
        console.error('Error fetching income by ID:', error);
        if (error.kind === 'ObjectId') {
             return res.status(404).json({ message: 'Income record not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching income.' });
    }
};


// @desc    Update an existing income entry
// @route   PUT /api/income/:id
// @access  Private
exports.updateIncome = async (req, res) => {
    const { description, amount, date, notes, source } = req.body; // Note: source is generally not recommended to change, especially if 'Sale'
    const incomeId = req.params.id;
    const userId = req.user.id;

    // Basic validation for update payload
    if (amount !== undefined && amount <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number.' });
    }
    // Add other validations as needed for description, etc.

    try {
        const income = await Income.findById(incomeId);

        if (!income) {
            return res.status(404).json({ message: 'Income record not found.' });
        }

        // Authorization: Check if the user trying to update is the creator
        if (income.createdBy.toString() !== userId) {
             // Optional: Allow admins to update? Add role check here if needed: && req.user.role !== 'admin'
            return res.status(403).json({ message: 'User not authorized to update this record.' });
        }

        // Prevent changing source if it was 'Sale' to maintain integrity
        if (income.source === 'Sale' && source && source !== 'Sale') {
             return res.status(400).json({ message: 'Cannot change the source of an income record linked to a sale.' });
        }
        // Prevent changing relatedSale ID manually
        if (req.body.relatedSale) {
            return res.status(400).json({ message: 'Cannot manually change the related sale.' });
        }

        // Update fields if they are provided in the request body
        if (description !== undefined) income.description = description;
        if (amount !== undefined) income.amount = amount; // Setter will handle formatting
        if (date !== undefined) income.date = date;
        if (notes !== undefined) income.notes = notes;
        // Only update source if it's NOT currently 'Sale' or if the new source IS 'Sale' (though changing TO 'Sale' manually is odd)
        if (source !== undefined && income.source !== 'Sale') income.source = source;

        const updatedIncome = await income.save(); // Use save() to trigger validation and middleware

        res.status(200).json(updatedIncome);

    } catch (error) {
        console.error('Error updating income:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Income record not found (invalid ID format).' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server error while updating income.' });
    }
};

// @desc    Delete an income entry
// @route   DELETE /api/income/:id
// @access  Private
exports.deleteIncome = async (req, res) => {
    const incomeId = req.params.id;
    const userId = req.user.id;

    try {
        const income = await Income.findById(incomeId);

        if (!income) {
            return res.status(404).json({ message: 'Income record not found.' });
        }

        // IMPORTANT: Prevent deleting income records automatically generated from sales
        if (income.source === 'Sale') {
            return res.status(400).json({ message: 'Cannot delete income records linked directly to sales. Consider adjusting the sale if needed.' });
        }

        // Authorization: Check if the user trying to delete is the creator
        if (income.createdBy.toString() !== userId) {
            // Optional: Allow admins to delete? Add role check here if needed: && req.user.role !== 'admin'
            return res.status(403).json({ message: 'User not authorized to delete this record.' });
        }

        await Income.findByIdAndDelete(incomeId); // Or income.deleteOne() / income.remove()

        res.status(200).json({ message: 'Income record deleted successfully.' }); // Send confirmation message

    } catch (error) {
        console.error('Error deleting income:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Income record not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deleting income.' });
    }
};

