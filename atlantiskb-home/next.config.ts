import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/__clerk/:path*',
        destination: '/api/clerk-proxy/:path*',
      },
    ]
  },
};

export default nextConfig;
