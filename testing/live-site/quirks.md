# Live Site Quirks

Track site-specific notes here instead of hardcoding one-off exceptions in the harness.

## Current Known Quirks

- X and Reddit should remain in conservative-host mode during browser capture. Failing by over-expanding replies is a product regression.
- Reuters often serves a DataDome anti-bot interstitial to automated browsers. Treat extension-path CAPTCHA detections there as `manual_review` unless a normal browser session reproduces the same failure.
- LinkedIn, Facebook, Quora, Fortune, Forbes, and Washington Post regularly change public/logged-out behavior. Treat repeated mismatches there as `manual_review` first unless the harness or app behavior is clearly wrong.
- Refresh or replace URLs in `corpus.md` when a target permanently redirects or becomes unusable; do not patch around dead URLs in code.
