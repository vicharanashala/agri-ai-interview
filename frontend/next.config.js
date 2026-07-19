/** @type {import('next').NextConfig} */
const BACKEND_STAGING = "https://agri-interview-backend-staging-239934307367.asia-south1.run.app";

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: `${process.env.NEXT_PUBLIC_ADMIN_API_URL || BACKEND_STAGING}/api/admin/:path*`,
      },
      {
        source: '/api/candidate/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || BACKEND_STAGING}/api/candidate/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;