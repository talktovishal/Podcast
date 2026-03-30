type ChromeExtensionGuidePanelsProps = {
  showStatusHint?: boolean;
};

export function ChromeExtensionGuidePanels({ showStatusHint = true }: ChromeExtensionGuidePanelsProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Walkthroughs</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Use the same extension flow whether you start here before logging in or open the signed-in setup page later. The only difference
          is that connect codes stay hidden until your account is authenticated.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>Install the extension from the Chrome Web Store.</li>
          <li>Generate a one-time connect code on this page after you log in, then paste it into the extension within 24 hours.</li>
          <li>If the code expires before you use it, generate a new one. Once paired, the extension stays connected until you revoke it.</li>
        </ul>
      </div>
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Quick start</h2>
        <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>1. Install the extension from the Chrome Web Store.</li>
          <li>2. Generate a one-time connect code on this page after login and paste it into the extension within 24 hours.</li>
          <li>3. Capture any standard HTTP or HTTPS article page with one click.</li>
          {showStatusHint ? <li>4. If processing takes longer, refresh your Episodes page to see the latest item status.</li> : null}
        </ol>
      </div>
    </section>
  );
}
