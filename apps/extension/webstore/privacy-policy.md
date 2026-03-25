# Privacy Policy — ArticlePod Capture

ArticlePod Capture only collects data required to submit pages you explicitly choose to capture.

## Data processed
- Current tab URL
- Current tab title
- Cleaned current-tab HTML snapshot when you click **Capture Current Page**
  - the extension may perform a bounded auto-reveal pass for likely article content
  - inert scripts, styles, templates, noscript blocks, and HTML comments are removed before upload
- Extension configuration data stored locally:
  - Active ArticlePod server target URL (resolved from packaged config)
  - Extension token
  - Token expiry timestamp

## Data use
Captured data is sent to your configured ArticlePod deployment to create podcast episodes in your own account.

## Data sharing
The extension does not sell data and does not share captured content with third parties outside your configured ArticlePod backend.

## Data storage
Extension stores only minimal connection state in `chrome.storage.local`.

## User control
You can disconnect anytime in the extension popup. Disconnect clears the local extension token.
