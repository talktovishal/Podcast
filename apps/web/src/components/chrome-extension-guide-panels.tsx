type ChromeExtensionGuidePanelsProps = {
  showStatusHint?: boolean;
};

export function ChromeExtensionGuidePanels({ showStatusHint = true }: ChromeExtensionGuidePanelsProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Walkthroughs</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Use the same extension flow whether you start here before logging in or return later from the signed-in app. Logged-out visitors
          only see the install steps; signed-in users get the ready-to-copy connect code on this page automatically.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>Install the extension from the Chrome Web Store.</li>
          <li>Open this page while signed in and copy the ready connect code.</li>
          <li>Paste it into the extension, then capture any open article page.</li>
          <li>For lighter saves, highlight text on any page and use the right-click menu to send it to Snippets with or without a comment.</li>
        </ul>
      </div>
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Quick start</h2>
        <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>1. Install the extension from the Chrome Web Store.</li>
          <li>2. Paste the copied connect code into the extension.</li>
          <li>3. Capture any standard HTTP or HTTPS article page with one click.</li>
          <li>4. Or highlight page text and right-click to save a snippet without starting podcast generation.</li>
          {showStatusHint ? <li>5. If processing takes longer, refresh your Episodes page to see the latest item status.</li> : null}
        </ol>
      </div>
    </section>
  );
}
