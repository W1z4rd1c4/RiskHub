import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Isolated native fixture: never substitutes demo identities or records credentials. */
export default defineConfig(base, {
    globalSetup: undefined,
    testMatch: ['**/native-account.spec.ts', '**/ux162-principal-session.spec.ts'],
    fullyParallel: false,
    retries: 0,
    use: { ...base.use, trace: 'off', video: 'off', screenshot: 'off' },
});
