// lib/financeCategorize.js — assigns a spending category to each
// extracted transaction.
//
// THIS IS A PLACEHOLDER for Phase 5. It uses simple keyword matching
// against the transaction description so the review table isn't empty
// while the real thing gets built. Swap the body of categorizeTransaction()
// for a call to the AI underwriting categorizer when that's ready — the
// category list (FINANCE_CATEGORIES) is the contract both sides need to
// agree on, so keep it in sync with lib/financeCategorize.js and
// script.js's FINANCE_CATEGORIES.

const FINANCE_CATEGORIES = [
  'Rent', 'Utilities', 'Food', 'Gambling', 'Loan Repayment',
  'Transport', 'Entertainment', 'Medical', 'Other'
];

const CATEGORY_KEYWORDS = {
  'Rent': ['rent', 'landlord', 'lease'],
  'Utilities': ['eskom', 'electricity', 'water', 'municipal', 'utilit', 'prepaid meter'],
  'Food': ['woolworths', 'checkers', 'pick n pay', 'pnp', 'shoprite', 'spar', 'grocer', 'restaurant', 'takeaway', 'uber eats', 'mr d'],
  'Gambling': ['betway', 'hollywoodbets', 'casino', 'bet ', 'lotto', 'sportingbet', 'playabets', 'supabets'],
  'Loan Repayment': ['loan', 'northline', 'repayment', 'installment', 'instalment', 'debit order'],
  'Transport': ['uber', 'bolt', 'taxi', 'fuel', 'petrol', 'garage', 'engen', 'shell', 'sasol', 'transport'],
  'Entertainment': ['netflix', 'showmax', 'dstv', 'spotify', 'cinema', 'movies', 'multichoice'],
  'Medical': ['pharmacy', 'clicks', 'dischem', 'dis-chem', 'medical', 'doctor', 'hospital', 'clinic', 'medaid', 'medical aid']
};

function categorizeTransaction(description) {
  const desc = (description || '').toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => desc.includes(k))) return category;
  }
  return 'Other';
}

module.exports = { categorizeTransaction, FINANCE_CATEGORIES };
