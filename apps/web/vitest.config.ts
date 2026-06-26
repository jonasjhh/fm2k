import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // @mui/material's .mjs build does a directory-style import of
        // react-transition-group/TransitionGroupContext, which Node's native ESM resolver
        // (used for .mjs files outside Vite's transform pipeline) can't resolve. Routing
        // @mui/material itself through Vite's own resolution fixes it.
        inline: ['@mui/material', 'react-transition-group'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/app/**'],
    },
  },
});
