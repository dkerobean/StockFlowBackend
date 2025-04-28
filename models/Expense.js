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

const defaultCategories = [
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
];

// Add default categories to the database if they don't exist
expenseSchema.statics.initializeCategories = async function () {
    const existingCategories = await this.distinct('category');
    const newCategories = defaultCategories.filter(category => !existingCategories.includes(category));

    if (newCategories.length > 0) {
        await Promise.all(newCategories.map(category => this.create({ category, description: `${category} expenses`, amount: 0, createdBy: null })));
    }
};

module.exports = mongoose.model('Expense', expenseSchema);