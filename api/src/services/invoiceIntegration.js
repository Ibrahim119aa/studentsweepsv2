require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const nowpaymentsKey = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const malumBusinessId = process.env.MALUM_BUSINESS_ID;
const malumPrivateKey = process.env.MALUM_PRIVATE_KEY;
const MALUM_WEBHOOK_KEY = process.env.MALUM_WEBHOOK_KEY;

async function createNowPaymentsInvoice({ priceAmount, priceCurrency = 'USD', payCurrency = null, orderId, orderDescription = '', ipnCallbackUrl, successUrl, cancelUrl }) {
  const endpoint = 'https://api.nowpayments.io/v1/invoice';
  const payload = {
    price_amount: priceAmount,
    price_currency: priceCurrency,
    order_id: orderId,
    order_description: orderDescription,
    ipn_callback_url: ipnCallbackUrl,
    success_url: successUrl,
    cancel_url: cancelUrl
  };

  const headers = {
    'x-api-key': nowpaymentsKey,
    'Content-Type': 'application/json'
  };

  try {
    logger.info('createNowPaymentsInvoice.request', { endpoint, payload: Object.assign({}, payload, { orderDescription: payload.orderDescription }) });
    const resp = await axios.post(endpoint, payload, { headers });
    logger.info('createNowPaymentsInvoice.response', { id: resp && resp.data && (resp.data.id || resp.data.invoice_id) });
    return resp.data;
  } catch (err) {
    logger.error('createNowPaymentsInvoice.error', { message: err.message, payload });
    throw err;
  }
}

async function createMalumCheckoutForm({ amount, currency = 'USD', webhookUrl, successUrl, cancelUrl, customerEmail = '', metadata = '', buyerPaysFees = 0 }) {
  const endpoint = 'https://malum.co/api/v2/payment/create';
  
  const headers = {
    'MALUM': `${malumBusinessId}:${malumPrivateKey}`,
    'Content-Type': 'application/json'
  };

  const payload = {
    amount: Number(amount),
    currency: String(currency),
    customer_email: String(customerEmail),
    webhook_url: String(webhookUrl),
    success_url: String(successUrl),
    cancel_url: String(cancelUrl),
    buyer_pays_fees: Boolean(buyerPaysFees),
    metadata: String(metadata).substring(0, 255),
    product_title: 'Payment',
    product_description: metadata ? String(metadata).substring(0, 800) : 'Thank you for your payment'
  };

  try {
    logger.info('createMalumCheckoutForm.request', { endpoint, amount, currency, customerEmail });
    const resp = await axios.post(endpoint, payload, { headers });
    
    // Malum returns JSON with direct checkout link
    const responseData = resp.data;
    logger.info('createMalumCheckoutForm.response', { 
      status: responseData?.status, 
      transaction_id: responseData?.transaction_id, 
      link: responseData?.link,
      fullResponse: JSON.stringify(responseData).substring(0, 500)
    });
    
    if (responseData?.status === 'success' && responseData?.link) {
      return {
        status: 'success',
        txn: responseData.transaction_id,
        url: responseData.link,
        transaction_id: responseData.transaction_id
      };
    }
    
    // If response doesn't have expected structure, log warning but still try to extract URL
    logger.warn('createMalumCheckoutForm.unexpectedResponse', { responseData });
    
    // Try to extract URL from various possible fields
    const url = responseData?.link || responseData?.url || responseData?.checkout_url || responseData?.payment_url;
    if (url) {
      return {
        status: responseData?.status || 'unknown',
        txn: responseData.transaction_id || responseData.txn || responseData.id,
        url: url,
        transaction_id: responseData.transaction_id || responseData.txn || responseData.id
      };
    }
    
    // If no URL found, throw error
    throw new Error(`Malum payment creation failed: ${JSON.stringify(responseData)}`);
  } catch (err) {
    logger.error('createMalumCheckoutForm.error', { message: err.message, amount, currency, responseData: err.response && err.response.data });
    throw err;
  }
}

// Expose webhook verification helpers
function verifyNowPaymentsSignature(rawBody, signature) {
  if (!NOWPAYMENTS_IPN_SECRET) return false;
  const computed = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET).update(rawBody).digest('hex');
  return computed === signature;
}

function verifyMalumSignature(payload) {
  if (!MALUM_WEBHOOK_KEY) return false;
  const { txn, timestamp, signature } = payload || {};
  const toSign = `${txn}|${timestamp}|${MALUM_WEBHOOK_KEY}`;
  const expectedSig = crypto.createHash('md5').update(toSign).digest('hex');
  return signature === expectedSig;
}

module.exports = {
  createNowPaymentsInvoice,
  createMalumCheckoutForm,
  verifyNowPaymentsSignature,
  verifyMalumSignature
};
