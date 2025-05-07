const mongoose = require('mongoose');

const posItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0.01
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    }
}, { _id: false });

const posSchema = new mongoose.Schema({
    items: [posItemSchema],
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    tax: {
        type: Number,
        default: 0,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled'],
        default: 'pending',
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'mobile_payment'],
        required: true
    },
    customer: {
        name: String,
        contact: String,
        email: String
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

// Pre-save hook to calculate totals
posSchema.pre('validate', function(next) {
    // Calculate subtotal
    this.subtotal = this.items.reduce((sum, item) => {
        const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
        return sum + itemTotal;
    }, 0);

    // Calculate total with tax and discount
    const taxAmount = (this.subtotal * (this.tax || 0)) / 100;
    const discountAmount = (this.subtotal * (this.discount || 0)) / 100;
    this.total = this.subtotal + taxAmount - discountAmount;

    if (this.total < 0) {
        this.total = 0;
    }
    next();
});

// Post-save hook to update inventory
posSchema.post('save', async function(doc, next) {
    try {
        // Update inventory for each item
        await Promise.all(doc.items.map(async item => {
            const inventory = await mongoose.model('Inventory').findOne({
                product: item.product,
                location: doc.location
            });

            if (inventory) {
                inventory.quantity -= item.quantity;
                await inventory.save();
            }
        }));

        // Create income record
        if (doc.total > 0) {
            await mongoose.model('Income').create({
                source: 'POS Sale',
                description: `Revenue from POS Sale ID: ${doc._id}`,
                amount: doc.total,
                date: doc.createdAt,
                relatedPOS: doc._id,
                createdBy: doc.createdBy,
                location: doc.location
            });
        }

        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('POS', posSchema);