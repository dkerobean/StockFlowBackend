const mongoose = require('mongoose');

const incomeCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Income category name is required.'],
        trim: true,
        unique: true
    },
    description: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

// Index for faster querying by name
incomeCategorySchema.index({ name: 1 });

module.exports = mongoose.model('IncomeCategory', incomeCategorySchema);
