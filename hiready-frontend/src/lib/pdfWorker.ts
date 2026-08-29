// Bundled pdf.js worker entry.
// Importing the polyfills here guarantees Uint8Array.prototype.toHex exists
// inside the worker realm (pdfjs-dist 5.x calls it while computing document
// fingerprints and crashes on browsers without that API).
import "../polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";
