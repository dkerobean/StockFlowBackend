const Expense = require('../models/Expense');

// @desc    Record a new expense entry
// @route   POST /api/expense
// @access  Private
exports.recordExpense = async (req, res) => {
    const { category, description, amount, date, paymentMethod, supplier, receiptUrl, notes } = req.body;

    // Basic validation
    if (!category || !description || !amount) {
        return res.status(400).json({ message: 'Category, description, and amount are required.' });
    }
     if (amount <= 0) {
         return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    try {
        const newExpense = new Expense({
            category,
            description,
            amount,
            date: date || Date.now(),
            paymentMethod,
            supplier,
            receiptUrl,
            notes,
            createdBy: req.user.id // From verifyToken middleware
        });

        const savedExpense = await newExpense.save();
        res.status(201).json(savedExpense);

    } catch (error) {
        console.error('Error recording expense:', error);
         if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server error while recording expense.' });
    }
};

// @desc    Get all expense entries
// @route   GET /api/expense
// @access  Private
exports.getAllExpenses = async (req, res) => {
    try {
        const expenses = await Expense.find({ /* add filters here */ })
                                       .populate('createdBy', 'username email')
                                       .sort({ date: -1 });

        res.status(200).json(expenses);

    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ message: 'Server error while fetching expenses.' });
    }
};

// @desc    Get a single expense entry by ID
// @route   GET /api/expense/:id
// @access  Private
exports.getExpenseById = async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id)
                                     .populate('createdBy', 'username email');

        if (!expense) {
            return res.status(404).json({ message: 'Expense record not found.' });
        }

        // Optional: Check ownership or role
        // if (expense.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
        //     return res.status(403).json({ message: 'User not authorized to view this record.' });
        // }

        res.status(200).json(expense);

    } catch (error) {
        console.error('Error fetching expense by ID:', error);
         if (error.kind === 'ObjectId') {
             return res.status(404).json({ message: 'Expense record not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching expense.' });
    }
};


// @desc    Update an existing expense entry
// @route   PUT /api/expense/:id
// @access  Private
exports.updateExpense = async (req, res) => {
    const { category, description, amount, date, paymentMethod, supplier, receiptUrl, notes } = req.body;
    const expenseId = req.params.id;
    const userId = req.user.id;

    // Basic validation for update payload
    if (amount !== undefined && amount <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number.' });
    }
    // Add other validations as needed

    try {
        const expense = await Expense.findById(expenseId);

        if (!expense) {
            return res.status(404).json({ message: 'Expense record not found.' });
        }

        // Authorization: Check if the user trying to update is the creator
        if (expense.createdBy.toString() !== userId) {
            // Optional: Allow admins? Add role check here: && req.user.role !== 'admin'
            return res.status(403).json({ message: 'User not authorized to update this record.' });
        }

        // Update fields if they are provided
        if (category !== undefined) expense.category = category;
        if (description !== undefined) expense.description = description;
        if (amount !== undefined) expense.amount = amount; // Setter handles formatting
        if (date !== undefined) expense.date = date;
        if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
        if (supplier !== undefined) expense.supplier = supplier; // Assumes supplier is an object { name, contact }
        if (receiptUrl !== undefined) expense.receiptUrl = receiptUrl;
        if (notes !== undefined) expense.notes = notes;

        const updatedExpense = await expense.save(); // Trigger validation and middleware

        res.status(200).json(updatedExpense);

    } catch (error) {
        console.error('Error updating expense:', error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Expense record not found (invalid ID format).' });
        }
         if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server error while updating expense.' });
    }
};

// @desc    Delete an expense entry
// @route   DELETE /api/expense/:id
// @access  Private
exports.deleteExpense = async (req, res) => {
    const expenseId = req.params.id;
    const userId = req.user.id;

    try {
        const expense = await Expense.findById(expenseId);

        if (!expense) {
            return res.status(404).json({ message: 'Expense record not found.' });
        }

        // Authorization: Check if the user trying to delete is the creator
        if (expense.createdBy.toString() !== userId) {
             // Optional: Allow admins? Add role check here: && req.user.role !== 'admin'
            return res.status(403).json({ message: 'User not authorized to delete this record.' });
        }

        await Expense.findByIdAndDelete(expenseId);

        res.status(200).json({ message: 'Expense record deleted successfully.' });

    } catch (error) {
        console.error('Error deleting expense:', error);
         if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Expense record not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deleting expense.' });
    }
};