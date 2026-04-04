import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  plugins: [react()],
  test: {
    dir: path.resolve(__dirname, '../tests/frontend/unit'),
    deps: {
      moduleDirectories: ['node_modules'],
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
      reportsDirectory: path.resolve(__dirname, '../tests/results/frontend/unit/coverage'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@test': path.resolve(__dirname, '../tests/frontend/unit/src/test'),
    },
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
        __dirname,
        path.resolve(__dirname, '../tests/frontend/unit'),
      ],
    },
  },
});
