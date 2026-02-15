/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@articlepod/core"],
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
