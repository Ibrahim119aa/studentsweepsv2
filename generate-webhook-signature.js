/**
 * Helper script to generate NowPayments webhook signature for Postman testing
 * 
 * Usage:
 *   1. Update the payload object below with your test data
 *   2. Set your IPN_SECRET (from .env file)
 *   3. Run: node generate-webhook-signature.js
 *   4. Copy the signature to Postman header: x-nowpayments-sig
 */

const crypto = require('crypto');

// ⚠️ IMPORTANT: Set your IPN secret from .env file
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || 'YOUR_IPN_SECRET_HERE';

// Recursive sort function (matches webhook handler)
function sortObjectRecursively(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Array) {
    return obj;
  }
  return Object.keys(obj).sort().reduce((result, key) => {
    result[key] = (obj[key] && typeof obj[key] === 'object' && !(obj[key] instanceof Array)) 
      ? sortObjectRecursively(obj[key]) 
      : obj[key];
    return result;
  }, {});
}

// Sample payload - UPDATE THIS WITH YOUR TEST DATA
const payload = {
  "actually_paid": 0.04781784,
  "actually_paid_at_fiat": 6.0,
  "fee": {
    "currency": "sol",
    "depositFee": "0",
    "serviceFee": "0",
    "withdrawalFee": "0"
  },
  "invoice_id": 6273668572,
  "order_description": "Donation Test Cause",
  "order_id": "DON17670826502124694", // ⚠️ UPDATE: Use actual transaction ID from your DB
  "outcome_amount": 0.0000635,
  "outcome_currency": "btc",
  "parent_payment_id": null,
  "pay_address": "4ahpSeDEBrpEGY6VL3HY4Qw2Y5xdmnDoXtCAq7hgzosA",
  "pay_amount": 0.04781784,
  "pay_currency": "sol",
  "payin_extra_id": null,
  "payment_extra_ids": null,
  "payment_id": 5333977169,
  "payment_status": "finished", // Options: "waiting", "finished", "paid", "confirmed", "failed"
  "price_amount": 6,
  "price_currency": "usd",
  "purchase_id": "5125864564",
  "updated_at": 1767082687409
};

// Generate signature
const sortedPayload = sortObjectRecursively(payload);
const sortedString = JSON.stringify(sortedPayload);

console.log('\n📋 Sorted JSON String (used for signature):');
console.log(sortedString);
console.log('\n');

if (!IPN_SECRET || IPN_SECRET === 'YOUR_IPN_SECRET_HERE') {
  console.error('❌ ERROR: Please set NOWPAYMENTS_IPN_SECRET in your .env file or update this script');
  console.error('   You can also set it directly: IPN_SECRET="your-secret-here" node generate-webhook-signature.js\n');
  process.exit(1);
}

const hmac = crypto.createHmac('sha512', IPN_SECRET);
hmac.update(sortedString);
const signature = hmac.digest('hex');

console.log('✅ Generated Signature:');
console.log(signature);
console.log('\n📝 Postman Header:');
console.log('   Key: x-nowpayments-sig');
console.log('   Value: ' + signature);
console.log('\n📦 Full Payload (copy to Postman Body):');
console.log(JSON.stringify(payload, null, 2));
console.log('\n');
