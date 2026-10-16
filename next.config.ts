import type { NextConfig } from 'next';

const isCfExport =
  process.env.CF_PAGES === '1' || process.env.STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  ...(isCfExport
    ? { output: 'export' }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
