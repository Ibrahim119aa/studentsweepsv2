#!/usr/bin/env node
// Seed payment options (NowPayments and Malum)
require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const PaymentOption = require('../models/PaymentOption');

async function seedPaymentOptions() {
  await connectDB();

  try {
    // Initialize NowPayments
    let nowpayments = await PaymentOption.findOne({ providerName: 'nowpayments' });
    if (!nowpayments) {
      nowpayments = await PaymentOption.create({
        providerName: 'nowpayments',
        enabled: true,
        credentials: [
          { key: 'apiKey', value: process.env.NOWPAYMENTS_API_KEY || '' },
          { key: 'ipnSecret', value: process.env.NOWPAYMENTS_IPN_SECRET || '' }
        ]
      });
      console.log('✅ Created NowPayments payment option');
    } else {
      // Update enabled status if it exists but is disabled
      if (!nowpayments.enabled) {
        nowpayments.enabled = true;
        await nowpayments.save();
        console.log('✅ Enabled NowPayments payment option');
      } else {
        console.log('ℹ️  NowPayments payment option already exists and is enabled');
      }
    }

    // Initialize Malum
    let malum = await PaymentOption.findOne({ providerName: 'malum' });
    if (!malum) {
      malum = await PaymentOption.create({
        providerName: 'malum',
        enabled: true,
        credentials: [
          { key: 'businessId', value: process.env.MALUM_BUSINESS_ID || '' },
          { key: 'privateKey', value: process.env.MALUM_PRIVATE_KEY || '' },
          { key: 'webhookKey', value: process.env.MALUM_WEBHOOK_KEY || '' }
        ]
      });
      console.log('✅ Created Malum payment option');
    } else {
      // Update enabled status if it exists but is disabled
      if (!malum.enabled) {
        malum.enabled = true;
        await malum.save();
        console.log('✅ Enabled Malum payment option');
      } else {
        console.log('ℹ️  Malum payment option already exists and is enabled');
      }
    }

    console.log('\n✅ Payment options initialized successfully!');
  } catch (err) {
    console.error('❌ Error seeding payment options:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

seedPaymentOptions();






