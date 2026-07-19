/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        // Rewrite admin API calls only when admin_session cookie is present.
        // Requests without the cookie (e.g. from withAuth which sends
        // X-Admin-Token instead) skip this rewrite and fall through to
        // route.ts which handles them server-side with BACKEND_URL.
        {
          source: '/api/admin/:path*',
          has: [
            {
              type: 'cookie',
              key: 'admin_session',
              value: '.+',
            },
          ],
          destination: `${process.env.BACKEND_URL || 'http://agri-interview-backend:8000'}/api/admin/:path*`,
        },
        {
          source: '/api/candidate/:path*',
          destination: `${process.env.NEXT_PUBLIC_API_URL}/api/candidate/:path*`,
        },
      ],
    };
  },
};

module.exports = nextConfig;