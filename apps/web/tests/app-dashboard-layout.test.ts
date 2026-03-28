import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("app dashboard uses direct navigation links and logout icon", () => {
  const source = readFileSync(new URL("../src/app/app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /<AppShellNav\b[^>]*\bcurrent=\"workspace\"/);
  assert.match(source, /<DashboardClient\b[\s\S]*\bviewMode=\"workspace\"/);
  assert.match(source, /\bisAdmin=\{user\.role\s*=\s*\==\s*\"ADMIN\"\}/);
  assert.equal(source.includes("FeedUrlActions"), false);
  assert.equal(source.includes("Demo mode ready"), false);
  assert.equal(source.includes("DeleteAccountButton"), false);
});

test("app shell nav keeps dedicated pages and icon logout", () => {
  const source = readFileSync(new URL("../src/components/app-shell-nav.tsx", import.meta.url), "utf8");

  assert.equal(source.includes('href: "/app/podcast-apps"'), true);
  assert.equal(source.includes('href: "/app/chrome-extension"'), true);
  assert.equal(source.includes('href: "/app/settings"'), true);
  assert.equal(source.includes('label: "Episodes"'), true);
  assert.equal(source.includes('label: "Podcast Apps"'), true);
  assert.equal(source.includes('label: "Chrome Extension"'), true);
  assert.equal(source.includes('label: "Summaries"'), true);
  assert.equal(source.includes('label: "Settings"'), true);
  assert.equal(source.includes('title: "Summaries"'), true);
  assert.equal(source.includes("NAV_ITEMS.filter((item) => item.key !== current)"), true);
  assert.equal(source.includes("flex-wrap"), true);
  assert.equal(source.includes("justify-start"), true);
  assert.equal(source.includes("md:flex-nowrap"), true);
  assert.equal(source.includes("md:justify-end"), true);
  assert.equal(source.includes("bg-emerald-50"), true);
  assert.equal(source.includes('variant="icon"'), true);
  assert.equal(source.includes("AccountOverflowMenu"), false);
});

test("feed url actions use a tappable copy box with inline feedback", () => {
  const source = readFileSync(new URL("../src/components/feed-url-actions.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("CopyableValueBox"), true);
  assert.equal(source.includes("Tap or click the box to copy your private feed URL."), true);
  assert.equal(source.includes("Feed URL copied."), true);
  assert.equal(source.includes("this legacy URL can no longer be shown here"), true);
  assert.equal(source.includes("Featured apps"), true);
  assert.equal(source.includes("Other podcast apps"), true);
  assert.equal(source.includes("ApplePodcastsIcon"), true);
  assert.equal(source.includes("YouTubeMusicIcon"), true);
  assert.equal(source.includes("com.google.android.apps.youtube.music"), true);
  assert.equal(source.includes("🎙 Apple Podcasts"), false);
  assert.equal(source.includes("▶️ YouTube Music"), false);
  assert.equal(source.indexOf('label: "Apple Podcasts"') < source.indexOf('label: "YouTube Music"'), true);
  assert.equal(source.indexOf('label: "YouTube Music"') < source.indexOf('label: "Pocket Casts"'), true);
});

test("settings page exists and renders settings-only dashboard mode", () => {
  const pagePath = new URL("../src/app/app/settings/page.tsx", import.meta.url);
  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");
  assert.equal(source.includes('current="settings"'), true);
  assert.equal(source.includes('viewMode="settings"'), true);
  assert.equal(source.includes('isAdmin={user.role === "ADMIN"}'), true);
  assert.equal(source.includes('settingsSections={["voice", "digest"]}'), true);
  assert.equal(source.includes('settingsSections={["demographics", "digest-runs"]}'), true);
  assert.equal(source.includes('href="/app/podcast-apps"'), false);
  assert.equal(source.includes('href="/app/chrome-extension"'), false);
  assert.equal(source.indexOf('settingsSections={["voice", "digest"]}') < source.indexOf("<BillingSettingsCard"), true);
  assert.equal(source.indexOf("<BillingSettingsCard") < source.indexOf('settingsSections={["demographics", "digest-runs"]}'), true);
  assert.equal(source.includes("DeleteAccountButton"), false);
});

test("podcast apps and chrome extension pages exist as dedicated setup pages", () => {
  const podcastPageSource = readFileSync(new URL("../src/app/app/podcast-apps/page.tsx", import.meta.url), "utf8");
  const extensionPageSource = readFileSync(new URL("../src/app/app/chrome-extension/page.tsx", import.meta.url), "utf8");
  const summaryPageSource = readFileSync(new URL("../src/app/app/summary/page.tsx", import.meta.url), "utf8");

  assert.equal(podcastPageSource.includes('viewMode="podcast-apps"'), true);
  assert.equal(podcastPageSource.includes("Podcast Apps"), true);
  assert.equal(podcastPageSource.includes("Quick start"), true);
  assert.equal(podcastPageSource.includes("App walkthroughs"), true);
  assert.equal(podcastPageSource.indexOf('viewMode="podcast-apps"') < podcastPageSource.indexOf("Quick start"), true);
  assert.equal(podcastPageSource.indexOf("Quick start") < podcastPageSource.indexOf("App walkthroughs"), true);
  assert.equal(podcastPageSource.includes("ensureUserDigestFeedTokenAccess"), false);
  assert.equal(podcastPageSource.includes("digestFeedUrl"), false);
  assert.equal(extensionPageSource.includes('viewMode="chrome-extension"'), true);
  assert.equal(extensionPageSource.includes("Chrome Extension"), true);
  assert.equal(extensionPageSource.includes("Quick start"), true);
  assert.equal(extensionPageSource.includes("Walkthroughs"), true);
  assert.equal(extensionPageSource.indexOf('viewMode="chrome-extension"') < extensionPageSource.indexOf("Walkthroughs"), true);
  assert.equal(extensionPageSource.indexOf("Walkthroughs") < extensionPageSource.indexOf("Quick start"), true);
  assert.equal(summaryPageSource.includes("Summaries"), true);
  assert.equal(summaryPageSource.includes('<h1 className=\"font-bold text-2xl\">Summary Studio</h1>'), false);
});

test("feedback page exists and keeps message as the first field", () => {
  const source = readFileSync(new URL("../src/components/feedback-form.tsx", import.meta.url), "utf8");
  const messageIndex = source.indexOf("Your feedback *");
  const typeIndex = source.indexOf("Type (optional)");
  const areaIndex = source.indexOf("Feature area (optional)");
  assert.equal(messageIndex > -1, true);
  assert.equal(typeIndex > -1, true);
  assert.equal(areaIndex > -1, true);
  assert.equal(messageIndex < typeIndex, true);
  assert.equal(typeIndex < areaIndex, true);
  assert.equal(source.includes("You may contact me by email about this feedback"), true);
});

test("dashboard client gates markdown controls to admins", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("isAdmin = false"), true);
  assert.equal(source.includes("{isAdmin ? ("), true);
  assert.equal(source.includes("{showItemsSection && isAdmin && markdownPreview ? ("), true);
});

test("dashboard client exposes importance, tags, and recent-item filters", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('importance: "LOW" | "MEDIUM" | "HIGH"'), true);
  assert.equal(source.includes("const [importanceInput, setImportanceInput] = useState<ItemImportance>(\"LOW\");"), true);
  assert.equal(source.includes('const [tagsInput, setTagsInput] = useState("");'), true);
  assert.equal(source.includes('const [showOptionalDetails, setShowOptionalDetails] = useState(false);'), true);
  assert.equal(source.includes('const OPTIONAL_DETAILS_STORAGE_KEY = "articlepod.dashboard.optional-details";'), true);
  assert.equal(source.includes("window.localStorage.getItem("), true);
  assert.equal(source.includes("OPTIONAL_DETAILS_STORAGE_KEY"), true);
  assert.equal(source.includes("window.localStorage.setItem("), true);
  assert.equal(source.includes('showOptionalDetails ? "expanded" : "collapsed"'), true);
  assert.equal(source.includes("Optional details"), true);
  assert.equal(source.includes("Title, importance, and tags are optional."), true);
  assert.equal(source.includes('aria-controls="submission-optional-details"'), true);
  assert.equal(source.includes('{showOptionalDetails ? "Hide" : "Show"}'), true);
  assert.equal(source.includes(">Optional<"), false);
  assert.equal(source.includes("Importance:"), true);
  assert.equal(source.includes("financial, personal, retirement"), true);
  assert.equal(source.includes("Optional title"), false);
  // Filters have been moved to the summaries page
  assert.equal(source.includes("Filter by importance"), false);
  assert.equal(source.includes("Filter by tag"), false);
  assert.equal(source.includes("No recent items match the current importance or tag filters."), false);
});

test("summary studio client exposes importance and tag filters", () => {
  const source = readFileSync(new URL("../src/components/summary-studio-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("Filter by importance"), true);
  assert.equal(source.includes("Filter by tag"), true);
  assert.equal(source.includes("All importance levels"), true);
  assert.equal(source.includes("All tags"), true);
});

test("dashboard client supports dedicated podcast and extension setup pages", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('viewMode?: "workspace" | "settings" | "podcast-apps" | "chrome-extension"'), true);
  assert.equal(source.includes('type SettingsSection = "voice" | "digest" | "demographics" | "digest-runs";'), true);
  assert.equal(source.includes('settingsSections?: ReadonlyArray<SettingsSection>;'), true);
  assert.equal(source.includes('const isPodcastAppsView = viewMode === "podcast-apps";'), true);
  assert.equal(source.includes('const isChromeExtensionView = viewMode === "chrome-extension";'), true);
  assert.equal(source.includes('id={isPodcastAppsView ? "podcast-apps" : undefined}'), true);
  assert.equal(source.includes('id={isChromeExtensionView ? "chrome-extension" : undefined}'), true);
  assert.equal(source.includes("Podcast Apps"), true);
  assert.equal(source.includes("Digest podcast feed"), false);
  assert.equal(source.includes("manual summary podcast episodes"), false);
  assert.equal(source.includes("/api/digest-feed-token/rotate"), false);
  assert.equal(source.includes("https://chromewebstore.google.com/detail/articlepod-capture/epjncnckcohefbopcbpfppfgljkkcmgp"), true);
  assert.equal(source.includes("Add to Chrome (Chrome Web Store)"), true);
  assert.equal(source.includes("Open extension settings"), false);
  assert.equal(source.includes("const showFeedSection = readOnly || isPodcastAppsView;"), true);
  assert.equal(source.includes("const showExtensionSection = !readOnly && isChromeExtensionView;"), true);
  assert.equal(source.includes("const showVoiceSettingsSection ="), true);
  assert.equal(source.includes('requestedSettingsSections.has("voice")'), true);
  assert.equal(source.includes("const showDigestSettingsSection ="), true);
  assert.equal(source.includes('requestedSettingsSections.has("digest")'), true);
  assert.equal(source.includes("is valid for 24 hours"), true);
  assert.equal(source.includes("If you do not use"), true);
  assert.equal(source.includes("it in time, generate a new one."), true);
  assert.equal(source.includes("Once you connect the extension, it"), true);
  assert.equal(source.includes("stays authorized until you revoke it."), true);
  assert.equal(source.includes("the code stops working and you must"), true);
  assert.equal(source.includes("generate a new one."), true);
  assert.equal(source.includes("does not expire automatically"), true);
  assert.equal(source.includes("Tap or click the box to copy the one-time connect code."), true);
  assert.equal(source.includes("Extension connect code copied."), true);
  assert.equal(source.includes("Copy code"), false);
});

test("extension popup treats installed tokens as non-expiring until revoked", () => {
  const popupSource = readFileSync(new URL("../../extension/popup.js", import.meta.url), "utf8");
  const popupMarkup = readFileSync(new URL("../../extension/popup.html", import.meta.url), "utf8");
  const popupStyles = readFileSync(new URL("../../extension/popup.css", import.meta.url), "utf8");

  assert.equal(popupSource.includes("This token does not expire automatically."), true);
  assert.equal(popupSource.includes("Extension connected successfully. It will stay connected until you revoke or disconnect it."), true);
  assert.equal(popupSource.includes('captureImportance: document.getElementById("capture-importance")'), true);
  assert.equal(popupSource.includes('captureTags: document.getElementById("capture-tags")'), true);
  assert.equal(popupSource.includes("importance: els.captureImportance?.value || \"LOW\""), true);
  assert.equal(popupSource.includes("tags: els.captureTags?.value || \"\""), true);
  assert.equal(popupSource.includes("Queued in ArticlePod"), true);
  assert.equal(popupSource.includes("articlepod-capture-confirmation"), false);
  assert.equal(popupSource.includes('setStatus("");'), true);
  assert.equal(popupSource.includes("queuedCaptureTargetKey"), true);
  assert.equal(popupSource.includes("currentCaptureTargetKey"), true);
  assert.equal(popupSource.includes("queuedForCurrentTarget"), true);
  assert.equal(popupSource.includes("CAPTURE_TARGET_REFRESH_MS"), true);
  assert.equal(popupMarkup.includes("Optional details"), false);
  assert.equal(popupMarkup.includes("Skip these if you just want the fastest capture."), false);
  assert.equal(popupMarkup.includes("Optional"), true);
  assert.equal(popupMarkup.includes("articlepod.com"), true);
  assert.equal(popupMarkup.includes("Open articlepod.com"), false);
  assert.equal(popupMarkup.includes('href="https://articlepod.com/"'), true);
  assert.equal(popupStyles.includes('button.primary[data-capture-state="queued"]'), true);
  assert.equal(popupStyles.includes('button.primary[data-capture-state="queued"]:disabled'), true);
  assert.equal(popupStyles.includes(".status:empty"), true);
  assert.equal(popupStyles.includes(".status.success"), true);
  assert.equal(popupStyles.includes(".footer-link-row"), true);
  assert.equal(popupStyles.includes(".footer-link"), true);
  assert.equal(popupStyles.includes("text-decoration: underline;"), true);
  assert.equal(popupSource.includes("Token expires:"), false);
  assert.equal(popupSource.includes("tokenExpired"), false);
});

test("dashboard client preloads audio metadata for preview and recent items", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('preload="metadata"'), true);
  assert.equal(source.includes("src={previewAudioUrl}"), true);
  assert.equal(source.includes("src={mediaUrl}"), true);
  assert.equal(source.includes("manage feed rotation only when you are ready to"), true);
  assert.equal(source.includes("Create workspace demo link"), true);
  assert.equal(source.includes("Share episode"), true);
  assert.equal(source.includes("Copy share link"), true);
  assert.equal(source.includes("Revoke share link"), true);
  assert.equal(source.includes("Episode share URL copied to clipboard."), true);
});

test("login redirects admins directly to admin dashboard", () => {
  const source = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  const providerSource = readFileSync(new URL("../src/lib/oauth-providers.ts", import.meta.url), "utf8");
  assert.equal(source.includes('router.push(json.role === "ADMIN" ? "/admin" : "/app")'), true);
  assert.equal(source.includes("Continue to your feed"), true);
  assert.equal(source.includes("First time with Google, Facebook, or Apple?"), true);
  assert.equal(source.includes("Use email instead"), true);
  assert.equal(source.includes("configuredProviders.map"), true);
  assert.equal(source.includes("const primaryAuthActionClass ="), true);
  assert.equal(source.includes('className={primaryAuthActionClass} href={provider.startPath}'), true);
  assert.equal(source.includes('className={primaryAuthActionClass} disabled={isLoading} onClick={submit}'), true);
  assert.equal(source.includes("bg-[var(--accent)]"), true);
  assert.equal(source.includes("text-white"), true);
  assert.equal(source.includes("No social sign-in providers are configured here yet. Use email below."), true);
  assert.equal(source.includes('mode === "login" ? "Log in with email" : "Create account with email"'), true);
  assert.equal(providerSource.indexOf('id: "google"') < providerSource.indexOf('id: "facebook"'), true);
  assert.equal(providerSource.indexOf('id: "facebook"') < providerSource.indexOf('id: "apple"'), true);
});
