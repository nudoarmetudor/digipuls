const crypto = require('crypto');

// Human-typeable one-time password for freshly-provisioned accounts —
// avoids visually ambiguous characters (0/O, 1/l/I).
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CHARSET[bytes[i] % CHARSET.length];
  return out;
}

module.exports = { generateTempPassword };
