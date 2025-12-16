const crypto = require('crypto');

// Uses AES-256-GCM to encrypt/decrypt small secrets (provider credentials)
// Key source: PAYMENT_SECRET_KEY OR JWT_SECRET. For production, set PAYMENT_SECRET_KEY.
const RAW_KEY =  process.env.JWT_SECRET || 'change_me_payment_secret';
const KEY = crypto.createHash('sha256').update(String(RAW_KEY)).digest(); // 32 bytes

function _randomIV() {
  return crypto.randomBytes(12); // 96-bit iv for GCM
}

function encrypt(plain) {
  if (plain === undefined || plain === null) return plain;
  const iv = _randomIV();
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: iv.base64.cipher.base64.tag.base64 joined with '.'
  return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;
}

function decrypt(token) {
  if (token === undefined || token === null) return token;
  if (typeof token !== 'string') return token;
  const parts = token.split('.');
  if (parts.length !== 3) return token; // assume not encrypted
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
  } catch (e) {
    // if decryption fails, return original token to avoid breaking callers
    return token;
  }
}

module.exports = { encrypt, decrypt };
