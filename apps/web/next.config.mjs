/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig = {
  transpilePackages: ["@articlepod/core"],
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
