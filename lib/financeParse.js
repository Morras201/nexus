// lib/financeParse.js — turns raw OCR/text-layer output from a bank
// statement into structured transactions: { date, description, amount }.
//
// Bank statement layouts vary a lot, so this uses a fairly general
// heuristic: a transaction line has a date somewhere near the start and
// an amount at the end, with the description being whatever's left in
// between. It will miss unusual layouts — treat this as a first pass
// that a human reviews in the Extracted transactions table, not a
// guaranteed-correct parser. Tightening it for specific bank formats
// (Capitec, FNB, Standard Bank, etc.) is a natural next step once real
// statements are being run through it.

const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/;
const AMOUNT_RE = /(-?R?\s?\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})?)\s*(?:Cr|Dr)?\s*$/i;

function parseTransactionsFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transactions = [];

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const amountMatch = line.match(AMOUNT_RE);
    if (!amountMatch) continue;

    const rawAmount = amountMatch[1].replace(/[R,\s]/g, '');
    const amount = parseFloat(rawAmount);
    if (Number.isNaN(amount)) continue;

    let description = line
      .slice(dateMatch.index + dateMatch[0].length, amountMatch.index)
      .trim()
      .replace(/\s{2,}/g, ' ')
      .replace(/^[-–:\s]+|[-–:\s]+$/g, '');

    if (!description) description = '(no description found)';

    transactions.push({
      date: normalizeDate(dateMatch[0]),
      description,
      amount
    });
  }

  return transactions;
}

function normalizeDate(raw) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[\/\-.]/);
  if (parts.length === 3) {
    let [d, m, y] = parts;
    if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return raw;
}

module.exports = { parseTransactionsFromText };
