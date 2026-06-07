import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? '/fm2k' : '',
  transpilePackages: ['@fm2k/engine'],
  turbopack: {},
};

export default nextConfig;
