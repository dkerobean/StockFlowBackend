// models/StockAdjustment.js
const mongoose = require('mongoose');
const AutoIncrementFactory = require('mongoose-sequence');

// Initialize AutoIncrement with mongoose
const AutoIncrement = AutoIncrementFactory(mongoose);

const stockAdjustmentSchema = new mongoose.Schema({
    adjustmentNumber: {
        type: String,
        unique: true,
        required: true,
        default: function() {
            return `ADJ-${new Date().getFullYear()}${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
        }
    },
    referenceNumber: { type: String, trim: true, index: true, sparse: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    adjustmentType: {
        type: String,
        enum: [
            'Addition', 'Subtraction', 'Damage', 'Theft', 'Correction',
            'Initial Stock', 'Return', 'Transfer Out', 'Transfer In',
            'Cycle Count Adj', 'Obsolete', 'Other'
        ],
        required: true
    },
    quantityAdjusted: {
        type: Number,
        required: true,
        min: [0],
        validate: { validator: Number.isInteger, message: '{VALUE} is not an integer value for quantityAdjusted' }
    },
    previousQuantity: {
        type: Number,
        required: true,
        validate: { validator: Number.isInteger, message: '{VALUE} is not an integer value' }
    },
    newQuantity: {
        type: Number,
        required: true,
        validate: { validator: Number.isInteger, message: '{VALUE} is not an integer value' }
    },
    reason: { type: String, trim: true },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adjustmentDate: { type: Date, default: Date.now, index: true },
    relatedTransfer: { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransfer', index: true, sparse: true }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Create compound index for better querying
stockAdjustmentSchema.index({ location: 1, adjustmentDate: -1 });
stockAdjustmentSchema.index({ product: 1, adjustmentDate: -1 });

// Add counter for sequential numbering (as a backup)
stockAdjustmentSchema.plugin(AutoIncrement, {
    inc_field: 'sequence',
    start_seq: 1,
    inc_amount: 1
});

// Pre-save middleware to ensure adjustmentNumber is set
stockAdjustmentSchema.pre('save', async function(next) {
    if (this.isNew && !this.adjustmentNumber) {
        const year = new Date().getFullYear();
        const sequence = this.sequence || Math.floor(Math.random() * 100000);
        this.adjustmentNumber = `ADJ-${year}${String(sequence).padStart(5, '0')}`;
    }
    next();
});

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);