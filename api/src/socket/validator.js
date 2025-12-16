// Lightweight runtime schema validator for socket payloads
// Schema format: { fieldName: { type: 'string'|'number'|'object'|'array'|'boolean', required: true|false } }
function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function validate(schema, payload) {
  const errors = [];
  if (!schema || typeof schema !== 'object') return { valid: true, errors: [] };
  for (const [key, rule] of Object.entries(schema)) {
    const val = payload ? payload[key] : undefined;
    if (rule.required && (val === undefined || val === null || (typeof val === 'string' && val.trim && val.trim() === ''))) {
      errors.push(`${key} is required`);
      continue;
    }
    if (val === undefined || val === null) continue; // not required and missing
    if (rule.type) {
      const got = typeOf(val);
      if (got !== rule.type) {
        // allow number strings if rule allows 'number' and val is numeric string? No, be strict.
        errors.push(`${key} should be ${rule.type}, got ${got}`);
      }
    }
    if (rule.custom && typeof rule.custom === 'function') {
      const msg = rule.custom(val, payload);
      if (typeof msg === 'string' && msg.length) errors.push(msg);
    }
  }
  return { valid: errors.length === 0, errors };
}

function emitIfInvalid(socket, schema, payload) {
  const res = validate(schema, payload);
  if (!res.valid) {
    socket.emit('error', { message: 'Invalid payload', details: res.errors });
  }
  return res.valid;
}

module.exports = { validate, emitIfInvalid };
