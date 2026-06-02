/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: `${process.env.BACKEND_URL}/api/admin/:path*`,
      },
      {
        source: '/api/interview/:path*',
        destination: `${process.env.BACKEND_URL}/api/interview/:path*`,
      },
      {
        source: '/api/faq/:path*',
        destination: `${process.env.BACKEND_URL}/api/faq/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
