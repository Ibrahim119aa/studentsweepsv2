const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const winnerSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    prize: {
        type: Schema.Types.ObjectId,
        ref: 'Prize',
        required: true,
        index: true
    },
    imageUrl: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    // Optional: reference to the transaction that made them a winner
    transaction: {
        type: Schema.Types.ObjectId,
        ref: 'Transaction'
    }
}, {
    timestamps: true
});

// Ensure one winner per prize (optional constraint)
winnerSchema.index({ prize: 1 }, { unique: true });

module.exports = mongoose.model('Winner', winnerSchema);





