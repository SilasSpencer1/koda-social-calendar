import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* Production optimizations */
  compress: true,

  /* Standalone output for Docker deployments */
  output: 'standalone',

  /* Exclude packages that use Node.js APIs from Edge bundling */
  serverExternalPackages: ['bcryptjs', '@prisma/client'],

  /* Image optimization */
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
  },

  /* Headers for caching and security */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
