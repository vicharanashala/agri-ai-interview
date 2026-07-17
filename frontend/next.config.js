/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    // Use BACKEND_URL for Docker-internal routing, NEXT_PUBLIC_API_URL for host access
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return [
      {
        source: '/api/admin/:path*',
        destination: `${backendUrl}/api/admin/:path*`,
      },
      {
        source: '/api/interview/:path*',
        destination: `${backendUrl}/api/interview/:path*`,
      },
      {
        source: '/api/faq/:path*',
        destination: `${backendUrl}/api/faq/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;