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

// Add updateExpense and deleteExpense functions as needed later