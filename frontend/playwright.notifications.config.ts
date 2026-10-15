import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Real application routes with every API response supplied by the layout spec.
// This focused run does not replace the live notification-delivery workflow.
export default defineConfig({
    ...config,
    globalSetup: undefined,
    testMatch: '**/notification-dropdown-layout.spec.ts',
    projects: config.projects?.filter(project => project.name === 'ci'),
    use: { ...config.use, baseURL: 'http://localhost:5191' },
    webServer: {
        command: 'npm run dev -- --port 5191 --strictPort',
        url: 'http://localhost:5191',
        reuseExistingServer: !process.env.CI,
    },
});
