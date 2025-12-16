const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect("mongodb+srv://asterus59_db_user:cHkOYxsce6GSDUlB@cluster0.vyhfxjj.mongodb.net/sweepstackz_testingg");
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;

