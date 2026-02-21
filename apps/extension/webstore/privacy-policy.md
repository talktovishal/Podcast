# Privacy Policy — ArticlePod Capture

ArticlePod Capture only collects data required to submit pages you explicitly choose to capture.

## Data processed
- Current tab URL
- Current tab title
- Current tab HTML (`document.documentElement.outerHTML`) when you click **Capture Current Page**
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
