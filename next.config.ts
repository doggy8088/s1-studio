import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import pkg from './package.json';

const isCfExport =
  process.env.CF_PAGES === '1' || process.env.STATIC_EXPORT === '1';

let gitSha = 'dev';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // Ignore if git is unavailable
}

const nextConfig: NextConfig = {
  ...(isCfExport
    ? { output: 'export' }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
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
