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

// The workflow selects system Chrome explicitly. With no override, the `ci`
// project must use Playwright's bundled Chromium so a missing system browser
// never changes projects or silently drops the ci-only accessibility suites.
const ciChromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined;
const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const resultsRoot = path.resolve(frontendRoot, '../tests/results/frontend/playwright');
const reportDir = path.join(resultsRoot, 'playwright-report');
const testResultsDir = path.join(resultsRoot, 'test-results');

// ADR-013 (N8): the extended accessibility smoke is restricted to the `ci`
// project — the only one with the committed strict-zero axe evidence matrix
// (tests/frontend/e2e/accessibility-axe-baseline.json). It is excluded from the
// chromium/firefox/webkit projects so the enforced matrix remains exact. Keep
// in sync with the guard note in accessibility-smoke.spec.ts.
// The N10 stateful a11y sweep (dora-ux-stateful-a11y.spec.ts) is likewise
// `ci`-only: its focus-trap/restoration + interception timing target the `ci`
// (Chromium) project e2e.yml runs, not the firefox/webkit matrix.
const CI_ONLY_SPECS = [
    '**/accessibility-smoke.spec.ts',
    '**/dora-ux-stateful-a11y.spec.ts',
    '**/dialog-render-sites.spec.ts',
    '**/theme-contrast-matrix.spec.ts',
];

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
      testIgnore: CI_ONLY_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: CI_ONLY_SPECS,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: CI_ONLY_SPECS,
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
