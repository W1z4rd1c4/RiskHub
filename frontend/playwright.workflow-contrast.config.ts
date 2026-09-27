import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Component contrast/state regressions need production CSS, but no live API.
export default defineConfig({
  ...config,
  globalSetup: undefined,
  testMatch: '**/workflow-contrast.spec.ts',
  projects: config.projects?.filter(project => project.name === 'ci'),
  use: { ...config.use, baseURL: 'http://localhost:5185' },
  webServer: {
    command: 'npm run dev -- --port 5185 --strictPort',
    url: 'http://localhost:5185',
    reuseExistingServer: !process.env.CI,
  },
});
