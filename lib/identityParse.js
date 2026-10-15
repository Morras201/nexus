// lib/identityParse.js — pulls a best-guess name, SA ID number, and
// address out of OCR'd text from an ID document or a proof-of-address
// document. This is a heuristic first pass, exactly like the bank
// statement parser (lib/financeParse.js) — it's meant to save typing,
// not to be trusted blindly. The New Customer form always shows the
// result as editable fields so it can be corrected before saving.

const ID_NUMBER_RE = /\b(\d{13})\b/;
// SA landline/mobile: optional +27 or 0 prefix, then 9 digits, loosely
// spaced/dashed as they usually appear on printed documents.
const PHONE_RE = /(\+27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/;

const NAME_LABELS = ['surname', 'surnames', 'names', 'forenames', 'full names', 'first names'];
const ADDRESS_KEYWORDS = /\b(street|str|road|rd|avenue|ave|drive|dr|crescent|cres|lane|ln|way|close|park|estate|flat|unit|complex)\b/i;
const POSTAL_CODE_RE = /\b\d{4}\b/;

function cleanLines(text) {
  return (text || '')
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// South African ID/smart-card OCR text usually contains explicit
// "Surname" / "Names" labels, either on their own line (value follows
// on the next line) or inline ("Surname: Steyn").
function guessName(lines) {
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    const label = NAME_LABELS.find(l => lower.startsWith(l));
    if (!label) continue;
    const inline = lines[i].slice(label.length).replace(/^[:\s-]+/, '').trim();
    if (inline && /[a-z]/i.test(inline)) return inline;
    const next = lines[i + 1];
    if (next && /^[A-Za-z][A-Za-z '-]{1,40}$/.test(next)) return next;
  }
  // Fallback: the first line that looks like "Firstname Lastname" in
  // capitals near the top of the document, ignoring obvious headers.
  const skip = /identity|republic|south africa|card|document|government/i;
  for (const line of lines.slice(0, 12)) {
    if (skip.test(line)) continue;
    if (/^[A-Z][A-Z '-]{3,40}$/.test(line) && line.split(' ').length <= 4) return toTitleCase(line);
  }
  return '';
}

function guessIdNumber(lines) {
  for (const line of lines) {
    const m = line.match(ID_NUMBER_RE);
    if (m) return m[1];
  }
  return '';
}

function guessPhone(lines) {
  for (const line of lines) {
    const m = line.match(PHONE_RE);
    if (m) {
      const digits = m[0].replace(/\D/g, '');
      if (m[0].trim().startsWith('+27')) return '+27' + digits.slice(2);
      if (digits.startsWith('27')) return '+' + digits;
      if (digits.startsWith('0')) return '+27' + digits.slice(1);
      return '+27' + digits;
    }
  }
  return '';
}

// Proof-of-address documents (utility bills, bank letters) usually have
// the address as 2-4 consecutive short lines containing a street-type
// keyword and, further down, a 4-digit postal code.
function guessAddress(lines) {
  const streetLineIdx = lines.findIndex(l => ADDRESS_KEYWORDS.test(l) && /\d/.test(l));
  if (streetLineIdx === -1) return '';
  const block = [lines[streetLineIdx]];
  for (let i = streetLineIdx + 1; i < Math.min(streetLineIdx + 4, lines.length); i++) {
    const l = lines[i];
    if (!l || l.length > 60) break;
    if (/^(tel|email|account|invoice|statement|date|amount|www\.)/i.test(l)) break;
    block.push(l);
    if (POSTAL_CODE_RE.test(l)) break;
  }
  return block.join(', ');
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function parseIdentityDocument(text, docType) {
  const lines = cleanLines(text);
  const result = { name: '', idNumber: '', address: '', phone: '' };
  if (docType === 'id_document') {
    result.name = guessName(lines);
    result.idNumber = guessIdNumber(lines);
    result.phone = guessPhone(lines);
  } else if (docType === 'proof_of_address') {
    result.name = guessName(lines);
    result.address = guessAddress(lines);
    result.phone = guessPhone(lines);
  }
  return result;
}

module.exports = { parseIdentityDocument };
