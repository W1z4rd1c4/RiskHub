import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig } from '@playwright/test';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const resultsRoot = path.resolve(frontendRoot, '../tests/results/frontend/playwright');

export default defineConfig({
    reporter: [
        ['html', { outputFolder: path.join(resultsRoot, 'playwright-report'), open: 'never' }],
        ['json', { outputFile: path.join(resultsRoot, 'test-results/results.json') }],
        ['junit', { outputFile: path.join(resultsRoot, 'test-results/junit.xml') }],
    ],
});
