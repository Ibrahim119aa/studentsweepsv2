# NowPayments Webhook Testing Guide for Postman

## Webhook Endpoint
```
POST https://studentsweeps.com/api/api/webhooks/nowpayments/ipn
```

## Required Headers
```
Content-Type: application/json
x-nowpayments-sig: <HMAC-SHA512 signature>
```

## How to Generate Signature

The signature is calculated using:
1. Sort the JSON payload **recursively** (all nested objects sorted alphabetically)
2. Convert sorted object to JSON string
3. Create HMAC-SHA512 hash using your `NOWPAYMENTS_IPN_SECRET`
4. Convert to hex string

### JavaScript Code to Generate Signature:
```javascript
const crypto = require('crypto');

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

const payload = {
  // Your payload here
};

const sortedPayload = sortObjectRecursively(payload);
const sortedString = JSON.stringify(sortedPayload);
const ipnSecret = 'YOUR_IPN_SECRET_HERE'; // From .env file
const hmac = crypto.createHmac('sha512', ipnSecret);
hmac.update(sortedString);
const signature = hmac.digest('hex');
console.log('Signature:', signature);
```

---

## Sample Payloads

### 1. Payment Completed (Order Transaction)
**Status:** `finished` (or `paid` or `confirmed`)

```json
{
  "actually_paid": 0.04781784,
  "actually_paid_at_fiat": 6.0,
  "fee": {
    "currency": "sol",
    "depositFee": "0",
    "serviceFee": "0",
    "withdrawalFee": "0"
  },
  "invoice_id": 6273668572,
  "order_description": "Entries for iPhone 15 Pro",
  "order_id": "ENT12345678901234567",
  "outcome_amount": 0.0000635,
  "outcome_currency": "btc",
  "parent_payment_id": null,
  "pay_address": "4ahpSeDEBrpEGY6VL3HY4Qw2Y5xdmnDoXtCAq7hgzosA",
  "pay_amount": 0.04781784,
  "pay_currency": "sol",
  "payin_extra_id": null,
  "payment_extra_ids": null,
  "payment_id": 5333977169,
  "payment_status": "finished",
  "price_amount": 6,
  "price_currency": "usd",
  "purchase_id": "5125864564",
  "updated_at": 1767082687409
}
```

### 2. Payment Completed (Donation Transaction)
**Status:** `finished`

```json
{
  "actually_paid": 0.04781784,
  "actually_paid_at_fiat": 6.0,
  "fee": {
    "currency": "btc",
    "depositFee": "0",
    "serviceFee": "0",
    "withdrawalFee": "0"
  },
  "invoice_id": 6273668573,
  "order_description": "Donation Test Cause",
  "order_id": "DON17670826502124694",
  "outcome_amount": 0.0000635,
  "outcome_currency": "btc",
  "parent_payment_id": null,
  "pay_address": "4ahpSeDEBrpEGY6VL3HY4Qw2Y5xdmnDoXtCAq7hgzosA",
  "pay_amount": 0.04781784,
  "pay_currency": "sol",
  "payin_extra_id": null,
  "payment_extra_ids": null,
  "payment_id": 5333977170,
  "payment_status": "finished",
  "price_amount": 6,
  "price_currency": "usd",
  "purchase_id": "5125864565",
  "updated_at": 1767082687409
}
```

### 3. Payment Waiting (Pending)
**Status:** `waiting`

```json
{
  "actually_paid": 0,
  "actually_paid_at_fiat": 0,
  "fee": {
    "currency": "btc",
    "depositFee": "0",
    "serviceFee": "0",
    "withdrawalFee": "0"
  },
  "invoice_id": 6273668574,
  "order_description": "Entries for MacBook Pro",
  "order_id": "ENT98765432109876543",
  "outcome_amount": 0.0000635,
  "outcome_currency": "btc",
  "parent_payment_id": null,
  "pay_address": "4ahpSeDEBrpEGY6VL3HY4Qw2Y5xdmnDoXtCAq7hgzosA",
  "pay_amount": 0.04781784,
  "pay_currency": "sol",
  "payin_extra_id": null,
  "payment_extra_ids": null,
  "payment_id": 5333977171,
  "payment_status": "waiting",
  "price_amount": 6,
  "price_currency": "usd",
  "purchase_id": "5125864566",
  "updated_at": 1767082687409
}
```

### 4. Payment Failed
**Status:** `failed` or `expired`

```json
{
  "actually_paid": 0,
  "actually_paid_at_fiat": 0,
  "fee": {
    "currency": "btc",
    "depositFee": "0",
    "serviceFee": "0",
    "withdrawalFee": "0"
  },
  "invoice_id": 6273668575,
  "order_description": "Donation Education Fund",
  "order_id": "DON98765432109876543",
  "outcome_amount": 0,
  "outcome_currency": "btc",
  "parent_payment_id": null,
  "pay_address": "4ahpSeDEBrpEGY6VL3HY4Qw2Y5xdmnDoXtCAq7hgzosA",
  "pay_amount": 0.04781784,
  "pay_currency": "sol",
  "payin_extra_id": null,
  "payment_extra_ids": null,
  "payment_id": 5333977172,
  "payment_status": "failed",
  "price_amount": 10,
  "price_currency": "usd",
  "purchase_id": "5125864567",
  "updated_at": 1767082687409
}
```

---

## Postman Setup Instructions

### Step 1: Create a New Request
1. Open Postman
2. Create a new POST request
3. Set URL: `https://studentsweeps.com/api/api/webhooks/nowpayments/ipn`

### Step 2: Set Headers
1. Go to **Headers** tab
2. Add:
   - Key: `Content-Type`, Value: `application/json`
   - Key: `x-nowpayments-sig`, Value: `<generated signature>` (see signature generation above)

### Step 3: Set Body
1. Go to **Body** tab
2. Select **raw** and **JSON**
3. Paste one of the sample payloads above
4. **Important:** Replace `order_id` with an actual transaction ID from your database

### Step 4: Generate Signature (Optional for Testing)
If you want to test signature verification:
1. Use the JavaScript code above to generate the signature
2. Or temporarily remove the signature header to test without verification (code allows this for testing)

### Step 5: Send Request
Click **Send** and check:
- Response status (should be 200 for valid requests)
- Server logs for webhook processing
- Database to verify transaction was updated

---

## Important Notes

1. **order_id**: Must match an existing `trxID` in your Transaction collection
2. **payment_status**: 
   - `finished`, `paid`, or `confirmed` → Marks transaction as paid
   - `waiting` → Payment pending
   - `failed`, `expired` → Payment failed
3. **Signature**: Required for production, optional for testing (code allows processing without it)
4. **Fee Object**: Must be included and sorted recursively for signature calculation
5. **Testing without Signature**: The code currently allows processing without signature verification (with a warning), but this should be removed in production

---

## Quick Test (Without Signature)

For quick testing without signature verification:
1. Remove the `x-nowpayments-sig` header
2. Use any of the sample payloads
3. Make sure `order_id` matches an existing transaction in your database

---

## Expected Responses

- **200 OK**: Webhook processed successfully
- **400 Bad Request**: Invalid signature or malformed request
- **500 Internal Server Error**: Server configuration error (missing IPN secret)
