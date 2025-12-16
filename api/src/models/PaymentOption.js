const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const secretStore = require('../utils/secretStore');

// Sub-schema for credentials
const credentialSchema = new Schema({
    key: { type: String, required: true },
    value: { type: String }
}, { _id: false });

const paymentOptionSchema = new Schema({
    providerName: {
        type: String,
        required: true,
        unique: true
    },
    enabled: {
        type: Boolean,
        default: false
    },
    credentials: [credentialSchema]
}, {
    timestamps: true
});

// Ensure credential values are encrypted before saving. We use a simple
// heuristic: encrypted values are formatted as "iv.base64.cipher.base64.tag.base64"
// (3 parts separated by dots). If a value already matches that shape we skip re-encrypting.
paymentOptionSchema.pre('save', function (next) {
    try {
        if (Array.isArray(this.credentials)) {
            this.credentials = this.credentials.map(c => {
                const v = c && c.value;
                if (!v) return { key: c.key, value: v };
                // if looks encrypted (3 parts) assume it's already encrypted
                if (typeof v === 'string' && v.split('.').length === 3) return { key: c.key, value: v };
                return { key: c.key, value: secretStore.encrypt(String(v)) };
            });
        }
        next();
    } catch (err) {
        next(err);
    }
});

// Return credentials with decrypted values
paymentOptionSchema.methods.getDecryptedCredentials = function () {
    if (!Array.isArray(this.credentials)) return [];
    return this.credentials.map(c => ({ key: c.key, value: c && c.value ? secretStore.decrypt(c.value) : c.value }));
};

module.exports = mongoose.model('PaymentOption', paymentOptionSchema);
