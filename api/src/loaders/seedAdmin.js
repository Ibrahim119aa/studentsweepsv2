#!/usr/bin/env node
// Seed admin user using DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD environment variables
require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/User');

async function seedAdmin() {
  // const email = process.env.DEFAULT_ADMIN_EMAIL;
  // const password = process.env.DEFAULT_ADMIN_PASSWORD;

  const email = "admin@example.com";
  const password = "ChangeMe123!";

  if (!email || !password) {
    console.log('DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD not set. Skipping admin seed.');
    process.exit(0);
  }

  await connectDB();

  try {
    let admin = await User.findOne({ emailAddress: email.toLowerCase() });
    if (admin) {
      if (!admin.isAdmin) {
        admin.isAdmin = true;
        await admin.save();
        console.log(`Updated existing user ${email} to isAdmin=true`);
      } else {
        console.log(`Admin user ${email} already exists`);
      }
    } else {
      admin = new User({ fullName: 'Administrator', emailAddress: email.toLowerCase(), password, isAdmin: true });
      await admin.save();
      console.log(`Created admin user ${email}`);
    }
  } catch (err) {
    console.error('Error seeding admin user:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

seedAdmin();
