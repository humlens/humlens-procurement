/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Docker image sets NEXT_OUTPUT=standalone; `next start` and dev are unaffected.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
    // Starts the background jobs in instrumentation.ts.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
