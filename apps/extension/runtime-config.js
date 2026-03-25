(function initArticlePodExtensionConfig(globalObject) {
  const config = {
    // Production package target. For local debugging against another origin,
    // temporarily change this URL and add the same origin to manifest.json
    // host_permissions before loading the extension unpacked.
    serverUrl: "https://articlepod.com"
  };

  globalObject.ARTICLEPOD_EXTENSION_CONFIG = config;
})(window);
