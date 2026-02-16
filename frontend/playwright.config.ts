import { defineConfig, devices } from '@playwright/test';

const ciChromiumChannel = process.env.CI && process.platform === 'darwin' ? 'chrome' : undefined;
const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI
        ? [
            ['html', { outputFolder: 'playwright-report' }],
            ['json', { outputFile: 'test-results/results.json' }],
            ['junit', { outputFile: 'test-results/junit.xml' }],
        ]
        : [
            ['html', { outputFolder: 'playwright-report' }],
            ['json', { outputFile: 'test-results/results.json' }],
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
                // macOS: prefer installed Chrome for stable headless runs.
                ...(ciChromiumChannel ? { channel: ciChromiumChannel } : {}),
            },
        },
    ],

    webServer: {
        command: 'npm run dev',
        url: frontendBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },

    /* Global setup for health checks */
    globalSetup: './e2e/setup/global-setup.ts',
});
