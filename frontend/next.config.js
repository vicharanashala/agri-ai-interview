/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: `${process.env.NEXT_PUBLIC_ADMIN_API_URL}/api/admin/:path*`,
      },
      {
        source: '/api/candidate/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/candidate/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;