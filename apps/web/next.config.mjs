/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@listenlater/core"],
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
