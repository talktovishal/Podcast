import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import { BRAND_ICON_192_PATH, BRAND_ICON_512_PATH } from "@/lib/brand-assets";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: "Turn saved reading into a private podcast feed.",
    start_url: "/",
    display: "standalone",
    background_color: "#082f49",
    theme_color: "#075e54",
    icons: [
      {
        src: BRAND_ICON_192_PATH,
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: BRAND_ICON_512_PATH,
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
