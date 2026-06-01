/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: 'http://backend:8000/api/admin/:path*',
      },
      {
        source: '/api/interview/:path*',
        destination: 'http://backend:8000/api/interview/:path*',
      },
      {
        source: '/api/faq/:path*',
        destination: 'http://backend:8000/api/faq/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
