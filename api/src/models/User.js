const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Schema = mongoose.Schema;

const userSchema = new Schema({
  fullName: { type: String, trim: true },
  // emailAddress is the primary identifier for users
  emailAddress: { type: String, unique: true, sparse: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, trim: true },
  profileImage: { type: String, trim: true },
  billingAddress: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true }
  },
  isAdmin: { type: Boolean, default: false },
  settings: {
    prizeAlert: { type: Boolean, default: false },
    drawResults: { type: Boolean, default: false },
    newsLetter: { type: Boolean, default: false }
  },
  stats: {
    totalOrders: { type: Number, default: 0 },
    totalEntries: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    prizesWon: { type: Number, default: 0 }
  },
  transactions: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }]
}, { timestamps: true });

// Hash password before save if modified
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = function(plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);

// Emit sanitized user object to the user's socket room when the document changes
try {
  const eventBus = require('../utils/eventBus');

  function sanitizeUser(doc) {
    if (!doc) return null;
    let obj = (typeof doc.toObject === 'function') ? doc.toObject({ getters: true }) : JSON.parse(JSON.stringify(doc));
    if (obj && typeof obj === 'object') {
      delete obj.password;
      delete obj.__v;
    }
    return obj;
  }

  // Post save hook
  userSchema.post('save', function(doc) {
    try {
      const userObj = sanitizeUser(doc);
      if (eventBus && eventBus.bus && typeof eventBus.bus.emit === 'function') {
        eventBus.bus.emit('user:updated', userObj);
      }
    } catch (e) {
      // swallow errors to not interrupt save
      // eslint-disable-next-line no-console
      console.warn('user post-save emit failed:', e && e.message);
    }
  });

  // Post findOneAndUpdate hook (fires after findOneAndUpdate)
  userSchema.post('findOneAndUpdate', function(doc) {
    try {
      if (!doc) return;
      const userObj = sanitizeUser(doc);
      if (eventBus && eventBus.bus && typeof eventBus.bus.emit === 'function') {
        eventBus.bus.emit('user:updated', userObj);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('user post-findOneAndUpdate emit failed:', e && e.message);
    }
  });
} catch (e) {
  // If eventBus can't be required (during tests or startup), ignore
}
