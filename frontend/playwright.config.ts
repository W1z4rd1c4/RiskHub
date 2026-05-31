import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

import { defineConfig, devices } from '@playwright/test';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const frontendNodeModules = path.join(frontendRoot, 'node_modules');

// Playwright loads suites from ../tests/frontend/e2e, so extend resolution to the frontend package root.
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${frontendNodeModules}${path.delimiter}${process.env.NODE_PATH}`
  : frontendNodeModules;
(Module as unknown as { _initPaths?: () => void })._initPaths?.();

const ciChromiumChannel =
  process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ||
  (process.env.CI && process.platform === 'darwin' ? 'chrome' : undefined);
const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const resultsRoot = path.resolve(frontendRoot, '../tests/results/frontend/playwright');
const reportDir = path.join(resultsRoot, 'playwright-report');
const testResultsDir = path.join(resultsRoot, 'test-results');

export default defineConfig({
  testDir: path.resolve(frontendRoot, '../tests/frontend/e2e'),
  testMatch: ['**/*.spec.ts'],
  outputDir: testResultsDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: reportDir }],
        ['json', { outputFile: path.join(testResultsDir, 'results.json') }],
        ['junit', { outputFile: path.join(testResultsDir, 'junit.xml') }],
      ]
    : [
        ['html', { outputFolder: reportDir }],
        ['json', { outputFile: path.join(testResultsDir, 'results.json') }],
      ],
  timeout: 60000,
  use: {
    baseURL: frontendBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'ci',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        ...(ciChromiumChannel ? { channel: ciChromiumChannel } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    cwd: frontendRoot,
    url: frontendBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  globalSetup: path.resolve(frontendRoot, '../tests/frontend/e2e/setup/global-setup.ts'),
});
