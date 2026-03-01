(function initArticlePodExtensionConfig(globalObject) {
  const config = {
    // Default ArticlePod web app URL.
    localServerUrl: "https://articlepod.com",

    // Set this for your private/tester Web Store listing.
    privateStoreServerUrl: "",

    // Set this for your public Web Store listing.
    publicStoreServerUrl: "",

    // Optional extension-id mapping when private and public listings use
    // different IDs. Values must be "private" or "public".
    byExtensionId: {
      // "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": "private",
      // "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": "public",
    },

    // Used when this extension ID is not mapped above.
    defaultChannel: "local",
  };

  globalObject.ARTICLEPOD_EXTENSION_CONFIG = config;
})(window);
