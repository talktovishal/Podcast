import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("app dashboard uses direct navigation links and logout icon", () => {
  const source = readFileSync(new URL("../src/app/app/page.tsx", import.meta.url), "utf8");

  assert.equal(source.includes('current="workspace"'), true);
  assert.equal(source.includes("AppShellNav"), true);
  assert.equal(source.includes("FeedUrlActions"), false);
  assert.equal(source.includes("Demo mode ready"), false);
  assert.equal(source.includes('viewMode="workspace"'), true);
  assert.equal(source.includes('isAdmin={user.role === "ADMIN"}'), true);
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
  assert.equal(source.indexOf('settingsSections={["voice", "digest"]}') < source.indexOf("<h2 className=\"text-lg font-semibold\">Billing</h2>"), true);
  assert.equal(source.indexOf("<h2 className=\"text-lg font-semibold\">Billing</h2>") < source.indexOf('settingsSections={["demographics", "digest-runs"]}'), true);
  assert.equal(source.includes("DeleteAccountButton"), false);
});

test("podcast apps and chrome extension pages exist as dedicated setup pages", () => {
  const podcastPageSource = readFileSync(new URL("../src/app/app/podcast-apps/page.tsx", import.meta.url), "utf8");
  const extensionPageSource = readFileSync(new URL("../src/app/app/chrome-extension/page.tsx", import.meta.url), "utf8");
  const summaryPageSource = readFileSync(new URL("../src/app/app/summary/page.tsx", import.meta.url), "utf8");

  assert.equal(podcastPageSource.includes('viewMode="podcast-apps"'), true);
  assert.equal(podcastPageSource.includes("Podcast Apps"), true);
  assert.equal(podcastPageSource.includes("Quick start"), true);
  assert.equal(podcastPageSource.includes("Walkthroughs"), true);
  assert.equal(podcastPageSource.indexOf('viewMode="podcast-apps"') < podcastPageSource.indexOf("Walkthroughs"), true);
  assert.equal(podcastPageSource.indexOf("Walkthroughs") < podcastPageSource.indexOf("Quick start"), true);
  assert.equal(extensionPageSource.includes('viewMode="chrome-extension"'), true);
  assert.equal(extensionPageSource.includes("Chrome Extension"), true);
  assert.equal(extensionPageSource.includes("Quick start"), true);
  assert.equal(extensionPageSource.includes("Walkthroughs"), true);
  assert.equal(extensionPageSource.indexOf('viewMode="chrome-extension"') < extensionPageSource.indexOf("Walkthroughs"), true);
  assert.equal(extensionPageSource.indexOf("Walkthroughs") < extensionPageSource.indexOf("Quick start"), true);
  assert.equal(summaryPageSource.includes("Summaries"), true);
  assert.equal(summaryPageSource.includes('<h1 className="font-bold text-2xl">Summary Studio</h1>'), false);
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
  assert.equal(source.includes("manual summary podcast episodes"), true);
  assert.equal(source.includes("https://chromewebstore.google.com/detail/articlepod-capture/epjncnckcohefbopcbpfppfgljkkcmgp"), true);
  assert.equal(source.includes("Add to Chrome (Chrome Web Store)"), true);
  assert.equal(source.includes("Open extension settings"), false);
  assert.equal(source.includes("const showFeedSection = readOnly || isPodcastAppsView;"), true);
  assert.equal(source.includes("const showExtensionSection = !readOnly && isChromeExtensionView;"), true);
  assert.equal(source.includes('const showVoiceSettingsSection = showSettingsSection && requestedSettingsSections.has("voice");'), true);
  assert.equal(source.includes('const showDigestSettingsSection = showSettingsSection && requestedSettingsSections.has("digest");'), true);
  assert.equal(source.includes("stays valid for 24 hours"), true);
  assert.equal(source.includes("stays authorized for 1 year"), true);
  assert.equal(source.includes("Tap or click the box to copy the one-time connect code."), true);
  assert.equal(source.includes("Extension connect code copied."), true);
  assert.equal(source.includes("Copy code"), false);
});

test("dashboard client preloads audio metadata for preview and recent items", () => {
  const source = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('preload="metadata" src={previewAudioUrl}'), true);
  assert.equal(source.includes('preload="metadata" src={mediaUrl}'), true);
  assert.equal(source.includes("manage feed rotation only when you are ready to"), true);
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
