import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("app dashboard uses direct navigation links and logout icon", () => {
  const source = readFileSync(
    new URL("../src/app/app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<AppShellNav\b[^>]*\bcurrent=\"workspace\"/);
  assert.equal(source.includes("WorkspaceBillingSummary"), true);
  assert.equal(
    source.includes('activationHint={billingSearchParam === "success"}'),
    true,
  );
  assert.equal(source.includes("billingConfigured={billingConfigured}"), true);
  assert.match(source, /<DashboardClient\b[\s\S]*\bviewMode=\"workspace\"/);
  assert.match(source, /\bisAdmin=\{user\.role\s*=\s*\==\s*\"ADMIN\"\}/);
  assert.equal(
    source.indexOf("<WorkspaceBillingSummary") <
      source.indexOf("<DashboardClient"),
    true,
  );
  assert.equal(source.includes("Your workspace"), false);
  assert.equal(source.includes("FeedUrlActions"), false);
  assert.equal(source.includes("Demo mode ready"), false);
  assert.equal(source.includes("DeleteAccountButton"), false);
  assert.equal(
    source.includes("keep an eye on processing and playback below"),
    true,
  );
  assert.equal(source.includes("py-4 sm:py-6"), true);
  assert.equal(source.includes("container-shell space-y-4 sm:space-y-5"), true);
});

test("workspace billing summary stays compact inside the header", () => {
  const source = readFileSync(
    new URL("../src/components/workspace-billing-summary.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("Billing"), true);
  assert.equal(source.includes("Manage billing"), false);
  assert.equal(source.includes("Upgrade to Pro"), true);
  assert.equal(source.includes('href="/pricing"'), true);
  assert.equal(source.includes("Billing ·"), true);
  assert.equal(source.includes("Choose Pro Monthly"), false);
  assert.equal(source.includes("Choose Pro Annual"), false);
  assert.equal(source.includes("Starter · Free"), false);
});

test("app shell nav keeps dedicated pages and icon logout", () => {
  const source = readFileSync(
    new URL("../src/components/app-shell-nav.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes('href: "/app/podcast-apps"'), true);
  assert.equal(source.includes('href: "/app/chrome-extension"'), true);
  assert.equal(source.includes('href: "/app/snippets"'), true);
  assert.equal(source.includes('href: "/app/settings"'), true);
  assert.equal(source.includes('label: "Episodes"'), true);
  assert.equal(source.includes('label: "Podcast Apps"'), true);
  assert.equal(source.includes('label: "Chrome Extension"'), true);
  assert.equal(source.includes('label: "Snippets"'), true);
  assert.equal(source.includes('label: "Summaries"'), true);
  assert.equal(source.includes('label: "Settings"'), true);
  assert.equal(source.includes('title: "Summaries"'), true);
  assert.equal(
    source.includes("NAV_ITEMS.filter((item) => item.key !== current)"),
    true,
  );
  assert.equal(source.includes("flex-wrap"), true);
  assert.equal(source.includes("justify-start"), true);
  assert.equal(source.includes("md:flex-nowrap"), true);
  assert.equal(source.includes("md:justify-end"), true);
  assert.equal(source.includes("bg-[rgba(223,243,236,0.38)]"), true);
  assert.equal(source.includes('variant="icon"'), true);
  assert.equal(source.includes("AccountOverflowMenu"), false);
});

test("feed url actions use a tappable copy box with inline feedback", () => {
  const source = readFileSync(
    new URL("../src/components/feed-url-actions.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("CopyableValueBox"), true);
  assert.equal(
    source.includes("Tap or click the box to copy your private feed URL."),
    true,
  );
  assert.equal(source.includes("Feed URL copied."), true);
  assert.equal(
    source.includes("this legacy URL can no longer be shown here"),
    true,
  );
  assert.equal(source.includes("Featured apps"), true);
  assert.equal(source.includes("Other podcast apps"), true);
  assert.equal(source.includes("ApplePodcastsIcon"), true);
  assert.equal(source.includes("YouTubeMusicIcon"), true);
  assert.equal(source.includes("com.google.android.apps.youtube.music"), true);
  assert.equal(source.includes("🎙 Apple Podcasts"), false);
  assert.equal(source.includes("▶️ YouTube Music"), false);
  assert.equal(
    source.indexOf('label: "Apple Podcasts"') <
      source.indexOf('label: "YouTube Music"'),
    true,
  );
  assert.equal(
    source.indexOf('label: "YouTube Music"') <
      source.indexOf('label: "Pocket Casts"'),
    true,
  );
  assert.equal(source.includes("autoFocusPrimaryAction = false"), true);
  assert.equal(source.includes("autoFocus={autoFocusPrimaryAction}"), true);
});

test("accent copy boxes keep a visible highlighted treatment", () => {
  const source = readFileSync(
    new URL("../src/components/copyable-value-box.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("bg-[rgba(223,243,236,0.82)]"), true);
  assert.equal(source.includes("border-[rgba(31,122,90,0.34)]"), true);
  assert.equal(source.includes("autoFocus = false"), true);
  assert.equal(
    source.includes("buttonRef.current?.focus({ preventScroll: true })"),
    true,
  );
  assert.equal(
    source.includes("focus:ring-4 focus:ring-[rgba(31,122,90,0.16)]"),
    true,
  );
  assert.equal(source.includes("bg-white/92 text-[var(--accent)]"), true);
});

test("settings page exists and renders settings-only dashboard mode", () => {
  const pagePath = new URL("../src/app/app/settings/page.tsx", import.meta.url);
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");
  assert.equal(source.includes('current="settings"'), true);
  assert.equal(source.includes('viewMode="settings"'), true);
  assert.equal(source.includes('isAdmin={user.role === "ADMIN"}'), true);
  assert.equal(
    source.includes('settingsSections={["voice", "digest", "demographics"]}'),
    true,
  );
  assert.equal(source.includes("getRecentDigestRuns"), false);
  assert.equal(source.includes('href="/app/podcast-apps"'), false);
  assert.equal(source.includes('href="/app/chrome-extension"'), false);
  assert.equal(
    source.indexOf("<BillingSettingsCard") <
      source.indexOf('settingsSections={["voice", "digest", "demographics"]}'),
    true,
  );
  assert.equal(source.includes("DeleteAccountButton"), false);
});

test("podcast apps and chrome extension pages exist as dedicated setup pages", () => {
  const podcastPageSource = readFileSync(
    new URL("../src/app/app/podcast-apps/page.tsx", import.meta.url),
    "utf8",
  );
  const extensionPageSource = readFileSync(
    new URL("../src/app/app/chrome-extension/page.tsx", import.meta.url),
    "utf8",
  );
  const resourcesPageSource = readFileSync(
    new URL("../src/app/(marketing)/resources/page.tsx", import.meta.url),
    "utf8",
  );
  const extensionCardSource = readFileSync(
    new URL(
      "../src/components/chrome-extension-setup-card.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const extensionGuideSource = readFileSync(
    new URL(
      "../src/components/chrome-extension-guide-panels.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const summaryPageSource = readFileSync(
    new URL("../src/app/app/summary/page.tsx", import.meta.url),
    "utf8",
  );
  const snippetsPageSource = readFileSync(
    new URL("../src/app/app/snippets/page.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(podcastPageSource.includes('viewMode="podcast-apps"'), true);
  assert.equal(podcastPageSource.includes("Podcast Apps"), true);
  assert.equal(podcastPageSource.includes("Quick start"), true);
  assert.equal(podcastPageSource.includes("App walkthroughs"), true);
  assert.equal(
    podcastPageSource.indexOf('viewMode="podcast-apps"') <
      podcastPageSource.indexOf("Quick start"),
    true,
  );
  assert.equal(
    podcastPageSource.indexOf("Quick start") <
      podcastPageSource.indexOf("App walkthroughs"),
    true,
  );
  assert.equal(
    podcastPageSource.includes("ensureUserDigestFeedTokenAccess"),
    false,
  );
  assert.equal(podcastPageSource.includes("digestFeedUrl"), false);
  assert.equal(extensionPageSource.includes("Chrome Extension"), true);
  assert.equal(extensionPageSource.includes("ChromeExtensionSetupCard"), true);
  assert.equal(
    extensionPageSource.includes("ChromeExtensionGuidePanels"),
    true,
  );
  assert.equal(extensionPageSource.includes("DashboardClient"), false);
  assert.equal(snippetsPageSource.includes("Snippets"), true);
  assert.equal(
    snippetsPageSource.includes("SnippetsWorkspaceClient"),
    true,
  );
  assert.equal(snippetsPageSource.includes('current="snippets"'), true);
  assert.equal(resourcesPageSource.includes("ChromeExtensionSetupCard"), false);
  assert.equal(
    resourcesPageSource.includes("ChromeExtensionGuidePanels"),
    false,
  );
  assert.equal(resourcesPageSource.includes("getAuthUserFromCookies"), true);
  assert.equal(resourcesPageSource.includes("Add to Chrome"), true);
  assert.equal(resourcesPageSource.includes("/app/chrome-extension"), true);
  assert.equal(resourcesPageSource.includes("/app/podcast-apps"), true);
  assert.equal(
    resourcesPageSource.includes(
      "Keep listening in the player you already trust.",
    ),
    true,
  );
  assert.equal(
    extensionCardSource.includes("Log in to generate connect code"),
    true,
  );
  assert.equal(
    extensionCardSource.includes("Connect code stays hidden until you log in"),
    true,
  );
  assert.equal(
    extensionCardSource.includes(
      "Public visitors can see the same setup steps",
    ),
    true,
  );
  assert.equal(
    extensionCardSource.includes("autoGeneratedRef.current = true;"),
    true,
  );
  assert.equal(
    extensionCardSource.includes(
      "Chrome Web Store opened and your connect code was copied.",
    ),
    true,
  );
  assert.equal(extensionCardSource.includes('"Generate new code"'), true);
  assert.equal(extensionCardSource.includes('"Generate connect code"'), true);
  assert.equal(extensionCardSource.includes("One-time connect code"), true);
  assert.equal(
    extensionCardSource.includes("bg-[rgba(223,243,236,0.82)]"),
    true,
  );
  assert.equal(
    extensionCardSource.includes("Preparing your one-time connect code..."),
    true,
  );
  assert.equal(extensionCardSource.includes("generateCodeButtonRef"), true);
  assert.equal(extensionCardSource.includes("pendingConnectCodeRef"), true);
  assert.equal(
    extensionCardSource.includes(
      "pendingConnectCodeRef.current?.focus({ preventScroll: true })",
    ),
    true,
  );
  assert.equal(
    extensionCardSource.includes(
      "generateCodeButtonRef.current?.focus({ preventScroll: true })",
    ),
    true,
  );
  assert.equal(extensionCardSource.includes("tabIndex={-1}"), true);
  assert.equal(extensionCardSource.includes("autoFocus"), true);
  assert.equal(
    extensionCardSource.includes(
      "Use it within 24 hours or generate a new one.",
    ),
    false,
  );
  assert.equal(
    extensionCardSource.includes("After this 24-hour window"),
    false,
  );
  assert.equal(extensionGuideSource.includes("within 24 hours"), false);
  assert.equal(
    extensionGuideSource.includes("ready-to-copy connect code"),
    true,
  );
  assert.equal(summaryPageSource.includes("Summaries"), true);
  assert.equal(
    summaryPageSource.includes(
      '<h1 className=\"font-bold text-2xl\">Summary Studio</h1>',
    ),
    false,
  );
});

test("youtube music walkthrough includes the updated help steps and animation", () => {
  const walkthroughSource = readFileSync(
    new URL("../src/components/podcast-app-walkthroughs.tsx", import.meta.url),
    "utf8",
  );
  const gifPath = new URL(
    "../public/resources/youtube-music-add-podcast.gif",
    import.meta.url,
  );

  assert.equal(
    walkthroughSource.includes(
      "https://support.google.com/youtubemusic/answer/13946190?hl=en",
    ),
    true,
  );
  assert.equal(
    walkthroughSource.includes("/resources/youtube-music-add-podcast.gif"),
    true,
  );
  assert.equal(walkthroughSource.includes("Open the YouTube Music app."), true);
  assert.equal(
    walkthroughSource.includes("Tap <Ui>Add a podcast by RSS feed</Ui>."),
    true,
  );
  assert.equal(
    walkthroughSource.includes("Read the disclaimer and accept it."),
    true,
  );
  assert.equal(existsSync(gifPath), true);
});

test("feedback page exists and keeps message as the first field", () => {
  const source = readFileSync(
    new URL("../src/components/feedback-form.tsx", import.meta.url),
    "utf8",
  );
  const messageIndex = source.indexOf("Your feedback *");
  const typeIndex = source.indexOf("Type (optional)");
  const areaIndex = source.indexOf("Feature area (optional)");
  assert.equal(messageIndex > -1, true);
  assert.equal(typeIndex > -1, true);
  assert.equal(areaIndex > -1, true);
  assert.equal(messageIndex < typeIndex, true);
  assert.equal(typeIndex < areaIndex, true);
  assert.equal(
    source.includes("You may contact me by email about this feedback"),
    true,
  );
});

test("dashboard client gates markdown controls to admins", () => {
  const source = readFileSync(
    new URL("../src/components/dashboard-client.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("isAdmin = false"), true);
  assert.equal(source.includes("!readOnly && isAdmin ?"), true);
  assert.equal(
    source.includes("{showItemsSection && isAdmin && markdownPreview ? ("),
    true,
  );
});

test("dashboard client exposes importance, tags, and recent-item filters", () => {
  const source = readFileSync(
    new URL("../src/components/dashboard-client.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes('importance: "LOW" | "MEDIUM" | "HIGH"'), true);
  assert.equal(
    source.includes(
      'const [importanceInput, setImportanceInput] = useState<ItemImportance>("LOW");',
    ),
    true,
  );
  assert.equal(
    source.includes('const [tagsInput, setTagsInput] = useState("");'),
    true,
  );
  assert.equal(
    source.includes(
      "const [showOptionalDetails, setShowOptionalDetails] = useState(false);",
    ),
    true,
  );
  assert.equal(
    source.includes(
      'const OPTIONAL_DETAILS_STORAGE_KEY = "articlepod.dashboard.optional-details";',
    ),
    true,
  );
  assert.equal(source.includes("window.localStorage.getItem("), true);
  assert.equal(source.includes("OPTIONAL_DETAILS_STORAGE_KEY"), true);
  assert.equal(source.includes("window.localStorage.setItem("), true);
  assert.equal(
    source.includes('showOptionalDetails ? "expanded" : "collapsed"'),
    true,
  );
  assert.equal(
    source.includes(
      "const urlInputRef = useRef<HTMLInputElement | null>(null);",
    ),
    true,
  );
  assert.equal(
    source.includes(
      'const focusTarget = sourceMode === "url" ? urlInputRef.current : pdfInputRef.current;',
    ),
    true,
  );
  assert.equal(
    source.includes("focusTarget.focus({ preventScroll: true });"),
    true,
  );
  assert.equal(
    source.includes("autoFocusPrimaryAction={isPodcastAppsView}"),
    true,
  );
  assert.equal(source.includes("Optional details"), true);
  assert.equal(
    source.includes("Title, importance, and tags are optional."),
    true,
  );
  assert.equal(
    source.includes('aria-controls="submission-optional-details"'),
    true,
  );
  assert.equal(
    source.includes('{showOptionalDetails ? "Hide" : "Show"}'),
    true,
  );
  assert.equal(source.includes(">Optional<"), false);
  assert.equal(source.includes("Importance:"), true);
  assert.equal(source.includes("financial, personal, retirement"), true);
  assert.equal(source.includes("Primary action"), false);
  assert.equal(
    source.includes(
      "Paste a URL or upload a PDF to turn it into a private podcast episode.",
    ),
    false,
  );
  assert.equal(source.includes("mt-2.5 space-y-2.5"), true);
  assert.equal(source.includes("p-2.5"), true);
  assert.equal(
    source.includes("rounded-2xl bg-[var(--accent-soft)]/35 p-3"),
    true,
  );
  assert.equal(
    source.includes(
      "rounded-2xl border border-[rgba(31,122,90,0.18)] bg-[var(--accent-soft)]/45 p-3",
    ),
    false,
  );
  assert.equal(source.includes("bg-white/80 p-2.5"), true);
  assert.equal(source.includes("focus-within:border-[var(--accent)]"), true);
  assert.equal(
    source.includes("focus-within:shadow-[0_0_0_4px_rgba(31,122,90,0.16)]"),
    true,
  );
  assert.equal(
    source.includes(
      "border-[rgba(31,122,90,0.34)] bg-[rgba(223,243,236,0.82)]",
    ),
    true,
  );
  assert.equal(
    source.includes('text-sm font-semibold text-[var(--accent)]">Article URL'),
    true,
  );
  assert.equal(
    source.includes('text-sm font-semibold text-[var(--accent)]">PDF file'),
    true,
  );
  assert.equal(
    source.includes("border-[rgba(31,122,90,0.32)] bg-white/96"),
    true,
  );
  assert.equal(
    source.includes("focus:shadow-[0_0_0_3px_rgba(31,122,90,0.12)]"),
    true,
  );
  assert.equal(source.includes("placeholder:text-slate-400"), true);
  assert.equal(source.includes("ref={urlInputRef}"), true);
  assert.equal(source.includes("Optional title"), false);
  // Filters have been moved to the summaries page
  assert.equal(source.includes("Filter by importance"), false);
  assert.equal(source.includes("Filter by tag"), false);
  assert.equal(
    source.includes(
      "No recent items match the current importance or tag filters.",
    ),
    false,
  );
});

test("summary studio client exposes importance and tag filters", () => {
  const source = readFileSync(
    new URL("../src/components/summary-studio-client.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("Filter by importance"), true);
  assert.equal(source.includes("Filter by tag"), true);
  assert.equal(source.includes("All importance levels"), true);
  assert.equal(source.includes("All tags"), true);
  assert.equal(source.includes("default 7-day selection"), false);
  assert.equal(source.includes("HTML_SNAPSHOT"), false);
  assert.equal(source.includes("Create podcast episode too"), false);
  assert.equal(source.includes("Podcast Publish"), true);
  assert.equal(source.includes("Also publish as podcast"), true);
});

test("dashboard client supports the dedicated podcast setup page and settings variants", () => {
  const source = readFileSync(
    new URL("../src/components/dashboard-client.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(
    source.includes('viewMode?: "workspace" | "settings" | "podcast-apps"'),
    true,
  );
  assert.equal(
    source.includes(
      'type SettingsSection = "voice" | "digest" | "demographics";',
    ),
    true,
  );
  assert.equal(
    source.includes("settingsSections?: ReadonlyArray<SettingsSection>;"),
    true,
  );
  assert.equal(
    source.includes('const isPodcastAppsView = viewMode === "podcast-apps";'),
    true,
  );
  assert.equal(
    source.includes('id={isPodcastAppsView ? "podcast-apps" : undefined}'),
    true,
  );
  assert.equal(source.includes("Podcast Apps"), true);
  assert.equal(source.includes("Digest podcast feed"), false);
  assert.equal(source.includes("manual summary podcast episodes"), false);
  assert.equal(source.includes("/api/digest-feed-token/rotate"), false);
  assert.equal(
    source.includes("const showFeedSection = readOnly || isPodcastAppsView;"),
    true,
  );
  assert.equal(source.includes("const showVoiceSettingsSection ="), true);
  assert.equal(source.includes('requestedSettingsSections.has("voice")'), true);
  assert.equal(source.includes("const showDigestSettingsSection ="), true);
  assert.equal(
    source.includes('requestedSettingsSections.has("digest")'),
    true,
  );
  assert.equal(source.includes("CollapsibleSettingsCard"), true);
  assert.equal(source.includes("<details"), true);
  assert.equal(source.includes("Recent Digest Runs"), false);
});

test("extension popup treats installed tokens as non-expiring until revoked", () => {
  const popupSource = readFileSync(
    new URL("../../extension/popup.js", import.meta.url),
    "utf8",
  );
  const popupMarkup = readFileSync(
    new URL("../../extension/popup.html", import.meta.url),
    "utf8",
  );
  const popupStyles = readFileSync(
    new URL("../../extension/popup.css", import.meta.url),
    "utf8",
  );

  assert.equal(
    popupSource.includes("This token does not expire automatically."),
    true,
  );
  assert.equal(
    popupSource.includes(
      "Extension connected successfully. It will stay connected until you revoke or disconnect it.",
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      'captureOptionsToggle: document.getElementById("capture-options-toggle")',
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      "captureOptionsToggleAction: document.getElementById(",
    ) && popupSource.includes('"capture-options-toggle-action"'),
    true,
  );
  assert.equal(
    popupSource.includes(
      'captureOptionsFields: document.getElementById("capture-options-fields")',
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      'captureImportance: document.getElementById("capture-importance")',
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      'captureTags: document.getElementById("capture-tags")',
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      'captureOptionsExpanded: "articlepod_capture_options_expanded"',
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      "captureOptionsExpanded = Boolean(state.captureOptionsExpanded);",
    ),
    true,
  );
  assert.equal(popupSource.includes("renderCaptureOptions();"), true);
  assert.equal(
    popupSource.includes("els.captureOptionsToggle.setAttribute(") &&
      popupSource.includes('"aria-expanded"') &&
      popupSource.includes('expanded ? "true" : "false"'),
    true,
  );
  assert.equal(
    popupSource.includes("els.captureOptionsFields.hidden = !expanded;"),
    true,
  );
  assert.equal(
    popupSource.includes(
      'els.captureOptionsToggleAction.textContent = expanded ? "Hide" : "Show";',
    ),
    true,
  );
  assert.equal(
    popupSource.includes(
      "[STORAGE_KEYS.captureOptionsExpanded]: captureOptionsExpanded",
    ),
    true,
  );
  assert.equal(
    popupSource.includes('importance: els.captureImportance?.value || "LOW"'),
    true,
  );
  assert.equal(
    popupSource.includes('tags: els.captureTags?.value || ""'),
    true,
  );
  assert.equal(popupSource.includes("Queued in ArticlePod"), true);
  assert.equal(popupSource.includes("articlepod-capture-confirmation"), false);
  assert.equal(popupSource.includes('setStatus("");'), true);
  assert.equal(popupSource.includes("queuedCaptureTargetKey"), true);
  assert.equal(popupSource.includes("currentCaptureTargetKey"), true);
  assert.equal(popupSource.includes("queuedForCurrentTarget"), true);
  assert.equal(popupSource.includes("CAPTURE_TARGET_REFRESH_MS"), true);
  assert.equal(popupMarkup.includes("Optional details"), false);
  assert.equal(
    popupMarkup.includes("Skip these if you just want the fastest capture."),
    false,
  );
  assert.equal(popupMarkup.includes("Optional"), true);
  assert.equal(popupMarkup.includes('id="capture-options-toggle"'), true);
  assert.equal(
    popupMarkup.includes('id="capture-options-toggle-action"'),
    true,
  );
  assert.equal(
    popupMarkup.includes(
      'id="capture-options-fields" class="optional-fields" hidden',
    ),
    true,
  );
  assert.equal(popupMarkup.includes('aria-expanded="false"'), true);
  assert.equal(popupMarkup.includes("Details"), true);
  assert.equal(popupMarkup.includes("Show"), true);
  assert.equal(popupMarkup.includes("articlepod.com"), true);
  assert.equal(popupMarkup.includes("Open articlepod.com"), false);
  assert.equal(popupMarkup.includes('href="https://articlepod.com/"'), true);
  assert.equal(
    popupStyles.includes('button.primary[data-capture-state="queued"]'),
    true,
  );
  assert.equal(
    popupStyles.includes(
      'button.primary[data-capture-state="queued"]:disabled',
    ),
    true,
  );
  assert.equal(popupStyles.includes(".optional-toggle"), true);
  assert.equal(popupStyles.includes(".optional-toggle-copy"), true);
  assert.equal(popupStyles.includes(".optional-toggle-action"), true);
  assert.equal(popupStyles.includes(".status:empty"), true);
  assert.equal(popupStyles.includes(".status.success"), true);
  assert.equal(popupStyles.includes(".footer-link-row"), true);
  assert.equal(popupStyles.includes(".footer-link"), true);
  assert.equal(popupStyles.includes("text-decoration: underline;"), true);
  assert.equal(popupSource.includes("Token expires:"), false);
  assert.equal(popupSource.includes("tokenExpired"), false);
});

test("dashboard client preloads audio metadata for preview and recent items", () => {
  const source = readFileSync(
    new URL("../src/components/dashboard-client.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes('preload="metadata"'), true);
  assert.equal(source.includes("src={previewAudioUrl}"), true);
  assert.equal(source.includes("src={mediaUrl}"), true);
  assert.equal(
    source.includes("manage feed rotation only when you are ready to"),
    true,
  );
  assert.equal(source.includes("Create workspace demo link"), true);
  assert.equal(source.includes("download href={mediaUrl}"), true);
  assert.equal(
    source.includes('className="flex flex-wrap items-center gap-2"'),
    true,
  );
  assert.equal(source.includes("Share episode"), true);
  assert.equal(source.includes("Copy share link"), true);
  assert.equal(source.includes("Revoke share link"), true);
  assert.equal(source.includes("Share link copied."), true);
  assert.equal(source.includes("Share link revoked."), true);
  assert.equal(source.includes("Creating share link..."), true);
  assert.equal(source.includes("Deleting..."), true);
  assert.equal(source.includes('role="status"'), true);
  assert.equal(source.includes("Item deleted."), true);
  assert.equal(
    source.includes("pointer-events-none fixed bottom-4 right-4 z-50"),
    true,
  );
});

test("auth landing redirects admins directly to admin dashboard", () => {
  const source = readFileSync(
    new URL("../src/components/auth-landing-page.tsx", import.meta.url),
    "utf8",
  );
  const providerSource = readFileSync(
    new URL("../src/lib/oauth-providers.ts", import.meta.url),
    "utf8",
  );
  const pricingSource = readFileSync(
    new URL("../src/app/(marketing)/pricing/page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(
    source.includes(
      'router.push(json.redirectTo || (json.role === "ADMIN" ? "/admin" : "/app"))',
    ),
    true,
  );
  assert.equal(source.includes("Continue to your feed"), false);
  assert.equal(
    source.includes(
      "First time? We&apos;ll create your account automatically.",
    ),
    true,
  );
  assert.equal(source.includes("Use email instead"), false);
  assert.equal(source.includes("Already have an email account?"), false);
  assert.equal(source.includes("Need a new account?"), false);
  assert.equal(source.includes("<span>OR</span>"), true);
  assert.equal(source.includes("configuredProviders.map"), true);
  assert.equal(source.includes("const primaryAuthActionClass ="), true);
  assert.equal(
    source.includes("href={buildOAuthStartHref(provider.startPath, nextPath)}"),
    true,
  );
  assert.equal(
    source.includes(
      "className={primaryAuthActionClass} disabled={isLoading} onClick={submit}",
    ),
    true,
  );
  assert.equal(source.includes("next: nextPath"), true);
  assert.equal(source.includes("bg-[var(--accent)]"), true);
  assert.equal(source.includes("text-white"), true);
  assert.equal(
    source.includes(
      "No social sign-in providers are configured here yet. Use email below.",
    ),
    true,
  );
  assert.equal(
    source.includes(
      'mode === "login" ? "Log in with email" : "Create account with email"',
    ),
    true,
  );
  assert.equal(
    pricingSource.includes('href={buildLoginHref({ next: "/pricing" })}'),
    true,
  );
  assert.equal(
    providerSource.indexOf('id: "google"') <
      providerSource.indexOf('id: "facebook"'),
    true,
  );
  assert.equal(
    providerSource.indexOf('id: "facebook"') <
      providerSource.indexOf('id: "apple"'),
    true,
  );
});
