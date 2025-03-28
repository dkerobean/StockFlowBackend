const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: [ // Example categories, customize as needed
            'Supplies',
            'Rent',
            'Utilities',
            'Salaries',
            'Marketing',
            'Travel',
            'Equipment',
            'Software',
            'Taxes',
            'Other'
        ],
        default: 'Other'
    },
    description: {
        type: String,
        required: [true, 'Expense description is required.'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Expense amount is required.'],
        min: [0.01, 'Amount must be positive.'],
        set: v => parseFloat(v.toFixed(2)) // Ensure 2 decimal places
    },
    date: {
        type: Date,
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'Credit Card', 'Bank Transfer', 'Check', 'Other'],
        required: false // Make optional or required based on needs
    },
    supplier: { // Optional supplier/vendor info
        name: String,
        contact: String
    },
    receiptUrl: { // Optional link to a scanned receipt
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    notes: {
        type: String,
        trim: true
    }
}, { timestamps: true });

// Index for faster querying by date or category
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });

module.exports = mongoose.model('Expense', expenseSchema);