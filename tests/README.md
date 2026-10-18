# Checks

Run the dependency-free calculation and OCR text-interpretation tests:

```sh
node --test tests/*.test.cjs
```

The browser checks require Playwright and system Chromium at `/usr/bin/chromium`
(as provided in the development environment). They use temporary synthetic images
and disposable browser storage. They never connect to Supabase or use real records.

From the repository root, run a local server in a separate terminal:

```sh
python3 -m http.server 8010 --bind 127.0.0.1
```

Then run:

```sh
node tests/performance-photo.browser.cjs
node tests/performance-photo-safety.browser.cjs
```

Set `CMANAGER_TEST_URL` to use another local test server. The first check renders
four Korean sample-layout images (including a small white amount bubble) and runs the real, vendored OCR engine. It checks
enlarged-bubble recognition, remaining-amount/credit-limit confusion, duplicated benefit rows, no writes before amount selection, one-click
save, replacement instead of addition, retained records and reload persistence.
The second uses a fake OCR worker to deterministically exercise wrong-month,
one-click save, cancellation, engine-failure and stale-result paths. Neither check
proves recognition accuracy on all screenshots or on an actual iPhone.

The source screenshots supplied in chat are not stored in the repository. The text
fixtures represent their layouts; actual recognition on those original images and
on iPhone Safari remains a manual check before deployment.
