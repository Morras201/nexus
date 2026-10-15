// lib/trial.js — 7-day free trial + per-customer unlock codes, no server.
//
// How it works:
//   1. On first launch, we generate a random "activation ID" for this
//      install and save it (with the install date) to a local JSON file
//      in the OS user-data folder. This ID is shown to the customer on
//      the trial-ended screen.
//   2. When their trial ends, they pay via your PayFast subscription
//      link, then send you their activation ID.
//   3. You run `node scripts/generate-unlock-code.js <activationId>` —
//      it prints a code, unique to that install, that you email back.
//   4. They paste the code into the app. We recompute the same code
//      locally (same secret, same HMAC) and compare — no internet
//      round-trip needed to verify it.
//
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeUnlockCode } = require('./unlock-code.js');

const TRIAL_DAYS = 7;

function licenseFilePath(app) {
  return path.join(app.getPath('userData'), 'license.json');
}

function loadOrCreateState(app) {
  const filePath = licenseFilePath(app);
  console.log('[Northline trial] license file path:', filePath);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // installDate stays null until completeSetup() is called — the trial
    // clock starts at the end of account setup, not at raw install time.
    const state = {
      activationId: crypto.randomBytes(8).toString('hex'),
      installDate: null,
      setupComplete: false,
      unlocked: false
    };
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    return state;
  }
}

function saveState(app, state) {
  fs.writeFileSync(licenseFilePath(app), JSON.stringify(state, null, 2));
}

// Called once the two-step account/business setup form is submitted —
// this is what actually starts the 7-day trial clock.
function completeSetup(app) {
  const state = loadOrCreateState(app);
  state.setupComplete = true;
  state.installDate = new Date().toISOString();
  saveState(app, state);
  return state;
}

// computeUnlockCode is imported from ./unlock-code.js above — kept in one
// place so lib/trial.js, scripts/generate-unlock-code.js, and the
// Paystack webhook can never drift out of sync with each other.


// Returns { setupComplete, unlocked, trialActive, daysRemaining, activationId }
function getTrialStatus(app) {
  const state = loadOrCreateState(app);

  if (!state.setupComplete) {
    return { setupComplete: false, unlocked: false, trialActive: false, daysRemaining: TRIAL_DAYS, activationId: state.activationId };
  }
  if (state.unlocked) {
    return { setupComplete: true, unlocked: true, trialActive: false, daysRemaining: 0, activationId: state.activationId };
  }
  const installedAt = new Date(state.installDate).getTime();
  const daysElapsed = (Date.now() - installedAt) / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));
  return {
    setupComplete: true,
    unlocked: false,
    trialActive: daysElapsed < TRIAL_DAYS,
    daysRemaining,
    activationId: state.activationId
  };
}

// Call when the customer submits a code. Returns true/false.
function tryUnlock(app, submittedCode) {
  const state = loadOrCreateState(app);
  const expected = computeUnlockCode(state.activationId);
  const normalize = (s) => (s || '').trim().toUpperCase();
  if (normalize(submittedCode) === expected) {
    state.unlocked = true;
    saveState(app, state);
    return true;
  }
  return false;
}

module.exports = { getTrialStatus, tryUnlock, completeSetup, TRIAL_DAYS };
