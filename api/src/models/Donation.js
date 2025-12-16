const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schema for the 'value' array within 'content'
const partnerInfoSchema = new Schema({
    description: String,
    icon: String,        // URL
    partners: String
}, { _id: false });

// Sub-schema for the 'content' array
const contentSchema = new Schema({
    key: String,
    value: [partnerInfoSchema]
}, { _id: false });


const donationSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    shortDescription: {
        type: String
    },
    image: {
        type: String, // URL for donation image
        trim: true
    },
    goal: {
        type: Number,
        required: true,
        default: 0
    },
    raised: {
        type: Number,
        required: true,
        default: 0
    },
    content: [contentSchema],
    transactions: [{
        type: Schema.Types.ObjectId,
        ref: 'Transaction'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Donation', donationSchema);
