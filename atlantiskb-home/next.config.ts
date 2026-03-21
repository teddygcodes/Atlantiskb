import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.com https://*.clerk.accounts.dev https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com",
      "img-src 'self' data: https: https://*.googleapis.com https://*.gstatic.com",
      "connect-src 'self' https://clerk.com https://*.clerk.accounts.dev https://api.anthropic.com https://api.openai.com wss: https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
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
