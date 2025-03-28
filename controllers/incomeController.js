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

