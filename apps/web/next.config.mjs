import path from 'node:path';
/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig = {
  transpilePackages: ["@articlepod/core"],
  webpack(config, { isServer }) {// CSS Tree's CommonJS export is relocated into the production server artifact;
    // keep its JSON data resolvable without changing client-side aliases.
    if (isServer) {
      const cssTreeCjs = require.resolve('css-tree');
      const cssTreeData = path.resolve(path.dirname(cssTreeCjs), '..', 'data', 'patch.json');
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        'css-tree$': cssTreeCjs,
        'css-tree/data/patch.json$': cssTreeData,
      };
    }

    if (isServer) {
      const fromCore = createRequire(require.resolve("@articlepod/core"));
      const fromJsdom = createRequire(fromCore.resolve("jsdom"));
      const cssTree = fromJsdom("css-tree/package.json");
      config.resolve.alias = { ...config.resolve.alias };
      // The ESM data loaders retain build-machine URLs; CommonJS lets Webpack bundle their JSON.
      for (const [subpath, target] of Object.entries(cssTree.exports)) {
        if (target && typeof target === "object" && typeof target.require === "string") {
          const name = subpath === "." ? "css-tree" : "css-tree/" + subpath.slice(2);
          config.resolve.alias[name + "$"] = fromJsdom.resolve(name);
        }
      }
    }
    return config;
  },
  async headers() {
    const scriptSrc = ["'self'", "'unsafe-inline'"];
    const connectSrc = ["'self'"];

    if (isDevelopment) {
      scriptSrc.push("'unsafe-eval'");
      connectSrc.push("ws:", "wss:");
    }

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc.join(" ")}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              `connect-src ${connectSrc.join(" ")}`,
              "media-src 'self' blob:",
              "object-src 'none'",
              "frame-ancestors 'none'"
            ].join("; ")
          }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: "/rss/:token.xml",
        destination: "/rss/:token"
      }
    ];
  }
};

export default nextConfig;
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
