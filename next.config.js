const withNextIntl = require('next-intl/plugin')('./lib/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'prisma'],
}

module.exports = withNextIntl(nextConfig);
