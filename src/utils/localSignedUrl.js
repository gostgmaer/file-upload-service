const crypto = require('crypto');
const { storage } = require('../config');

function sign(destinationPath, expiresAt) {
  return crypto
    .createHmac('sha256', storage.localSignedUrlSecret)
    .update(`${destinationPath}:${expiresAt}`)
    .digest('hex');
}

// Constant-time signature check + expiry check. Returns false (never throws)
// on any malformed input so callers can treat it as a simple boolean gate.
function verify(destinationPath, expiresAt, signature) {
  if (!destinationPath || !expiresAt || !signature) return false;
  if (Date.now() > Number(expiresAt)) return false;

  const expected = Buffer.from(sign(destinationPath, expiresAt), 'hex');
  const provided = Buffer.from(String(signature), 'hex');
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

module.exports = { sign, verify };
