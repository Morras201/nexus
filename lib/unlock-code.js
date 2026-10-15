// lib/unlock-code.js — single source of truth for turning an activation ID
// into an unlock code. Used by:
//   - lib/trial.js          (verifies a code the customer types in)
//   - scripts/generate-unlock-code.js  (manual fallback / testing)
//   - lib/paystack-webhook.js          (auto-generates + emails the code)
//
// SECRET_KEY must stay identical everywhere this is used — it's what makes
// a code valid only for the activation ID it was generated for.
const SECRET_KEY = '73c1ba2617923b7dd92271e5a51fc291df66c8ec3c961e16';

const crypto = require('crypto');

function computeUnlockCode(activationId) {
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(activationId).digest('hex');
  const raw = hmac.slice(0, 12).toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

module.exports = { SECRET_KEY, computeUnlockCode };
