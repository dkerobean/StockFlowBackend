// models/StockAdjustment.js
const mongoose = require('mongoose');
const AutoIncrementFactory = require('mongoose-sequence'); // Import factory

// Initialize AutoIncrement with your mongoose connection
// Do this *after* you've established your main mongoose connection in server.js/app.js
// If you pass mongoose directly, ensure it's the connected instance.
// It's often safer to pass the connection object if available.
// Assuming `mongoose` is the connected instance here:
const AutoIncrement = AutoIncrementFactory(mongoose);


const stockAdjustmentSchema = new mongoose.Schema({
    // --- Add adjustmentNumber for the sequential ID ---
    adjustmentNumber: {
        type: String,
        unique: true,
        // We will generate this in the pre-save hook using the counter
    },
    // --- End Add ---
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
        type: Number, required: true, min: [0],
        validate: { validator: Number.isInteger, message: '{VALUE} is not an integer value for quantityAdjusted' }
    },
    previousQuantity: { type: Number, required: true, validate: { validator: Number.isInteger, message: '{VALUE} is not an integer value' } },
    newQuantity: { type: Number, required: true, validate: { validator: Number.isInteger, message: '{VALUE} is not an integer value' } },
    reason: { type: String, trim: true },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adjustmentDate: { type: Date, default: Date.now, index: true },
    relatedTransfer: { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransfer', index: true, sparse: true }
}, { timestamps: true });

// --- Add mongoose-sequence plugin ---
// `inc_field` specifies the field name on *this* document that will store the sequence number.
// `id` is a unique identifier for this sequence counter in the database's counters collection.
// `reference_fields` (optional) can be used to create separate sequences based on other fields (e.g., per location), but we want a global sequence here.
stockAdjustmentSchema.plugin(AutoIncrement, {
    inc_field: 'adjustmentCounter', // Field name to store the numeric sequence value
    id: 'stockAdjustmentSeq',       // Unique ID for the counter in the DB
    start_seq: 1                    // Starting number for the sequence
});

// --- Add pre-save hook to format adjustmentNumber ---
stockAdjustmentSchema.pre('save', function(next) {
    // Only generate the number if the document is new and the counter has been set
    if (!this.isNew || this.adjustmentNumber) {
        next();
        return;
    }
    // Format the number using the 'adjustmentCounter' field set by the plugin
    if (this.adjustmentCounter) {
        this.adjustmentNumber = `ADJ-${String(this.adjustmentCounter).padStart(5, '0')}`; // e.g., ADJ-00001
    }
    // Note: If the plugin fails or runs after this hook, adjustmentNumber might be empty.
    // Consider adding error handling or ensuring plugin runs first if needed.
    next();
});
// --- End AutoIncrement setup ---

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);