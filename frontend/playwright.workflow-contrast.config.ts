import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Component contrast/state regressions need production CSS, but no live API.
// theme-rendered-contrast.spec.ts (G-RENDER) measures the same harness pages
// plus frontend/dialog-contract.html in all three themes against a baseline.
export default defineConfig({
  ...config,
  globalSetup: undefined,
  testMatch: ['**/workflow-contrast.spec.ts', '**/theme-rendered-contrast.spec.ts'],
  projects: config.projects?.filter(project => project.name === 'ci'),
  use: { ...config.use, baseURL: 'http://localhost:5185' },
  webServer: {
    command: 'npm run dev -- --port 5185 --strictPort',
    url: 'http://localhost:5185',
    reuseExistingServer: !process.env.CI,
  },
});
