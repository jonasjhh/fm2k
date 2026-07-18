import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // Same workaround as apps/web: @mui/material's .mjs build does a directory-style
        // import of react-transition-group/TransitionGroupContext, which Node's native ESM
        // resolver can't handle — route both through Vite's own resolution.
        inline: ['@mui/material', 'react-transition-group'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/index.ts'],
    },
  },
});
