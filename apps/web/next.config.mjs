/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@articlepod/core"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com"
      }
    ]
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
