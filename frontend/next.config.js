/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/api/interview/:path*',
        destination: 'http://localhost:8000/api/interview/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
