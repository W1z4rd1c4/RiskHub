import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const testRoot = path.resolve(__dirname, '../tests/frontend/unit');
const frontendProbeImporter = path.resolve(__dirname, 'src/main.tsx');
const forwardedExternalTestImports = new Set([
  'react',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
  'react-router-dom',
  '@azure/msal-browser',
  '@tanstack/react-query',
  '@testing-library/react',
  '@testing-library/user-event',
  'msw',
  'msw/node',
  'react-i18next',
]);

function externalTestPackageResolver() {
  return {
    name: 'external-test-package-resolver',
    async resolveId(source: string, importer?: string) {
      if (!importer) {
        return null;
      }
      if (!importer.startsWith(testRoot)) {
        return null;
      }
      if (!forwardedExternalTestImports.has(source)) {
        return null;
      }

      const resolved = await this.resolve(source, frontendProbeImporter, { skipSelf: true });
      return resolved?.id ?? null;
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [externalTestPackageResolver(), react()],
  test: {
    dir: testRoot,
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
      allow: [__dirname, testRoot],
    },
  },
});
