const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });

function formatAjvErrors(errors) {
  if (!errors) return [];
  return errors.map(e => {
    const prop = e.instancePath ? e.instancePath.replace(/^\//, '').replace(/\//g, '.') : e.params && e.params.missingProperty ? e.params.missingProperty : '';
    return prop ? `${prop} ${e.message}` : `${e.message}`;
  });
}

// Validate payload against JSON schema; emit on socket and return boolean
function validateEmit(schema, payload, socket, errorEvent = 'error') {
  try {
    const validate = ajv.compile(schema || {});
    const valid = validate(payload);
    if (!valid) {
      const details = formatAjvErrors(validate.errors);
      socket.emit(errorEvent, { message: 'Invalid payload', details });
      return false;
    }
    return true;
  } catch (err) {
    socket.emit(errorEvent, { message: 'Validator error', details: [err.message] });
    return false;
  }
}

module.exports = { validateEmit };
