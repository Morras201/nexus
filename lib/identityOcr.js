// lib/identityOcr.js — text extraction for ID documents and proof-of-
// address documents. Reuses the existing PDF pipeline (financeOcr.js:
// pdf-parse first, tesseract.js OCR fallback for scanned PDFs) and adds
// direct image OCR, since ID copies and utility bills are very often
// uploaded as plain photos (JPG/PNG) rather than PDFs.
const { extractTextFromPdf } = require('./financeOcr');

async function extractTextFromDocument(buffer, mimeType) {
  const type = (mimeType || '').toLowerCase();
  if (type === 'application/pdf' || type === 'pdf') {
    return extractTextFromPdf(buffer);
  }
  // Image formats (jpg, png, webp, heic-converted, etc.) — OCR directly.
  const Tesseract = require('tesseract.js');
  const { data } = await Tesseract.recognize(buffer, 'eng');
  return { text: data.text || '' };
}

module.exports = { extractTextFromDocument };
