(function initArticlePodExtensionConfig(globalObject) {
  const config = {
    // Default ArticlePod web app target. For local debugging against another
    // ArticlePod origin, temporarily change this URL before loading unpacked.
    serverUrl: "https://articlepod.com"
  };

  globalObject.ARTICLEPOD_EXTENSION_CONFIG = config;
})(window);
