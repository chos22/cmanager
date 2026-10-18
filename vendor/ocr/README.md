# Local screenshot recognition assets

These files are served from this application's own origin. No OCR API, CDN, account,
or secret is used at runtime. Screenshot pixels and recognized text are held only
in browser/worker memory; the existing manual save stores the confirmed amount.
Only the engine/model files can be cached by the existing service worker.

Pinned npm sources and package SHA-512 integrity values are recorded in SOURCES.json.
Packages were downloaded from registry.npmjs.org with npm and their tarball SHA-512
values were checked against the registry integrity metadata before extraction.

- tesseract.js 7.0.0: dist/tesseract.min.js and dist/worker.min.js, Apache-2.0.
- tesseract.js-core 7.0.0: tesseract-core-lstm.wasm.js, Apache-2.0.
  This portable LSTM core embeds WebAssembly; no SIMD-only or legacy engine is needed.
- @tesseract.js-data/kor 1.0.0 and @tesseract.js-data/eng 1.0.0:
  4.0.0_best_int/*.traineddata.gz (compact LSTM models from Tesseract tessdata).
  Upstream Tesseract models are Apache-2.0; see https://github.com/tesseract-ocr/tessdata.

Engine licenses/notices are included alongside these files. The assets total about
8.3 MB and are loaded only when a screenshot is selected, not at app startup.
To upgrade, download pinned packages with npm, preserve integrity checks and license
notices, update SOURCES.json, and rerun the real browser OCR test. Do not replace
models or disable verification to bypass an installation error.
