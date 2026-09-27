import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Production KRI detail routes against bounded, intercepted history responses.
export default defineConfig({
  ...config,
  globalSetup: undefined,
  testMatch: '**/kri-history-pagination.spec.ts',
  projects: config.projects?.filter(project => project.name === 'ci'),
  workers: 1,
  use: { ...config.use, baseURL: 'http://localhost:5183' },
  webServer: {
    command: 'npm run dev -- --port 5183 --strictPort',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
  },
});
