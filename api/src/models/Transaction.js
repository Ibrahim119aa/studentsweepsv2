const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schema for order entries
const entrySchema = new Schema({
    amount: { type: Number, default: 0 },
    costPerEntry: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    entryNumbers: [String]
}, { _id: false });

// Sub-schema for the 'order' category
const orderSchema = new Schema({
    prizeName: String,
    dateTimestamp: Date,
    status: {
        type: String,
        enum: ['pendingPayment', 'active', 'drawn', 'drawnWinner']
    },
    isWinner: { type: Boolean, default: false },
    isPaid: { type: Boolean, default: false },
    entries: entrySchema,
    // Payment integration details
    paymentProvider: { type: String },
    invoiceId: { type: String },
    invoiceData: { type: Schema.Types.Mixed },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, { _id: false });

// Sub-schema for the 'donation' category
const donationTrxSchema = new Schema({
    name: String,
    dateTimestamp: Date,
    amount: { type: Number, default: 0 }, // Store donation amount
    isPaid: { type: Boolean, default: false },
    // Payment integration details
    paymentProvider: { type: String },
    invoiceId: { type: String },
    invoiceData: { type: Schema.Types.Mixed },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, { _id: false });

// Sub-schema for the 'prizePayout' category
const prizePayoutSchema = new Schema({
    name: String,
    dateTimestamp: Date,
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'cancelled']
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, { _id: false });


const transactionSchema = new Schema({
    trxID: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // Top-level user who owns this transaction
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    category: {
        type: String,
        required: true,
        enum: ['order', 'donation', 'prizePayout'],
        index: true
    },
    // Conditionally populated fields based on category
    order: {
        type: orderSchema,
        required: function() { return this.category === 'order'; }
    },
    donation: {
        type: donationTrxSchema,
        required: function() { return this.category === 'donation'; }
    },
    prizePayout: {
        type: prizePayoutSchema,
        required: function() { return this.category === 'prizePayout'; }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);
