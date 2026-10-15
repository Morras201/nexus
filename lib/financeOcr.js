// lib/financeOcr.js — pulls text out of an uploaded PDF.
//
// Strategy: try the PDF's embedded text layer first (fast, exact, works
// fully offline with no image rendering). If that comes back empty or
// too short — which usually means the PDF is a scanned/photographed
// document with no real text layer — fall back to rendering each page
// to an image and running Tesseract OCR on it.

const pdfParse = require('pdf-parse');

const MIN_TEXT_LAYER_LENGTH = 40; // below this, assume it's a scanned doc

async function extractTextFromPdf(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();
    if (text.length >= MIN_TEXT_LAYER_LENGTH) {
      return { text, method: 'text-layer', pages: data.numpages };
    }
    console.log('PDF text layer too short/empty — falling back to OCR.');
  } catch (err) {
    console.error('pdf-parse failed, falling back to OCR:', err.message);
  }

  try {
    const text = await ocrPdfBuffer(buffer);
    return { text, method: 'ocr' };
  } catch (err) {
    throw new Error(`Could not read this PDF (no usable text layer, and OCR fallback failed: ${err.message}).`);
  }
}

async function ocrPdfBuffer(buffer) {
  // Loaded lazily: these are only needed for the OCR fallback path, so
  // a normal text-based PDF never pays the cost of pulling them in.
  // Uses @napi-rs/canvas rather than node-canvas — it ships prebuilt
  // binaries for Windows/macOS/Linux, so `npm install` never needs a
  // C++ compiler or Python on the machine running it.
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const { createCanvas } = require('@napi-rs/canvas');
  const Tesseract = require('tesseract.js');

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // higher scale = better OCR accuracy
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const imageBuffer = canvas.toBuffer('image/png');
    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng');
    fullText += text + '\n';
  }

  return fullText.trim();
}

module.exports = { extractTextFromPdf };
