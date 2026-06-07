import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['@fm2k/engine'],
  turbopack: {},
};

export default nextConfig;
