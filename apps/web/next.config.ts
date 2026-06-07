import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@fm2k/engine'],
  turbopack: {},
};

export default nextConfig;
