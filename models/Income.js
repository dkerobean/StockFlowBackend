const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema({
    source: {
        type: String,
        required: true,
        enum: ['Sale', 'Service', 'Investment', 'Other'],
        default: 'Other'
    },
    description: {
        type: String,
        required: [true, 'Income description is required.'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Income amount is required.'],
        min: [0.01, 'Amount must be positive.'],
        set: v => parseFloat(v.toFixed(2))
    },
    date: {
        type: Date,
        default: Date.now
    },
    relatedSale: { // Link to the sale if source is 'Sale'
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sale',
        required: function() { return this.source === 'Sale'; } 
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

// Index for faster querying by date or source
incomeSchema.index({ date: -1 });
incomeSchema.index({ source: 1 });

module.exports = mongoose.model('Income', incomeSchema);