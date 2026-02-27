export const BRAND_FAVICON_PATH = "/favicon.ico";
export const BRAND_APPLE_ICON_PATH = "/apple-icon.png";
export const BRAND_ICON_192_PATH = "/brand/brain-mark-192.png";
export const BRAND_ICON_512_PATH = "/brand/brain-mark-512.png";
export const BRAND_PODCAST_COVER_PATH = "/brand/podcast-cover-1400.png";
export const BRAND_MANIFEST_PATH = "/manifest.webmanifest";

export function absoluteBrandAssetUrl(appUrl: string, assetPath: string): string {
  return new URL(assetPath, appUrl).toString();
}
