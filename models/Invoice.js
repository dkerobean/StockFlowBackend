const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    sale: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sale',
        required: true
    },
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        name: String,
        email: String,
        contact: String
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        },
        name: String,
        quantity: Number,
        price: Number,
        discount: Number,
        total: Number
    }],
    subtotal: {
        type: Number,
        required: true
    },
    tax: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Paid', 'Unpaid', 'Overdue'],
        default: 'Paid'
    },
    dueDate: {
        type: Date,
        required: true
    },
    paymentMethod: {
        type: String,
        required: true
    },
    location: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Location',
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    notes: String
}, { timestamps: true });

// Generate invoice number before saving
invoiceSchema.pre('save', async function(next) {
    if (!this.invoiceNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await this.constructor.countDocuments();
        this.invoiceNumber = `INV-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);