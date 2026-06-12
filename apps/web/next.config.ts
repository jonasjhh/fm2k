import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? '/fm2k' : '',
  transpilePackages: ['@fm2k/engine', '@fm2k/state', '@fm2k/design-system', '@fm2k/backend'],
  turbopack: {},
};

export default nextConfig;
