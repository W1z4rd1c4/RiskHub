import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
    ...config,
    globalSetup: undefined,
    testMatch: '**/creation-access-check.spec.ts',
    projects: config.projects?.filter(project => project.name === 'ci'),
    use: { ...config.use, baseURL: 'http://localhost:5181' },
    webServer: {
        command: 'npm run dev -- --port 5181 --strictPort',
        url: 'http://localhost:5181',
        reuseExistingServer: !process.env.CI,
    },
});
