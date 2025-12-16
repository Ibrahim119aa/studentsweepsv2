const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schema for key-value pairs in detailsSpecs
const detailSpecSchema = new Schema({
    key: { type: String, required: true },
    value: { type: String, required: true }
}, { _id: false });

const prizeSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    shortDescription: {
        type: String,
        required: true
    },
    thumbnail: {
        type: String // URL
    },
    category: {
        type: String,
        index: true
    },
    previewImages: [{
        type: String // Array of URLs
    }],
    drawTimestamp: {
        type: Date
    },
    entries: {
        totalEntries: { type: Number, default: 0 },
        maxEntries: { type: Number },
        minEntriesOrder: [{ type: Number }], // Assuming this is an array of numbers
        entryPrice: { type: Number, required: true, default: 0 }
    },
    detailsSpecs: [detailSpecSchema],
    detailedDescription: {
        type: String
    },
    status: {
        type: String,
        required: true,
        enum: ['active', 'drawn'],
        default: 'active',
        index: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Prize', prizeSchema);
