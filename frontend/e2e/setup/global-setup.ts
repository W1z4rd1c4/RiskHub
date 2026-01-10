/**
 * Playwright Global Setup
 *
 * Runs before all tests to verify backend and frontend are healthy.
 * Called once per test run via playwright.config.ts globalSetup.
 */

import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig): Promise<void> {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const frontendUrl = config.projects[0]?.use?.baseURL || 'http://localhost:5173';

    console.log('🔍 E2E Global Setup: Verifying services...');

    // Check backend health
    try {
        const backendResponse = await fetch(`${backendUrl}/api/v1/health`);
        if (!backendResponse.ok) {
            throw new Error(`Backend health check failed: ${backendResponse.status}`);
        }
        console.log('✅ Backend is healthy');
    } catch (error) {
        console.error('❌ Backend health check failed:', error);
        console.log('   Make sure backend is running: cd backend && python -m uvicorn app.main:app --reload');
        throw new Error('Backend is not available. Start it before running E2E tests.');
    }

    // Check frontend availability
    try {
        const frontendResponse = await fetch(frontendUrl);
        if (!frontendResponse.ok) {
            throw new Error(`Frontend check failed: ${frontendResponse.status}`);
        }
        console.log('✅ Frontend is available');
    } catch (error) {
        console.error('❌ Frontend check failed:', error);
        console.log('   Make sure frontend is running: cd frontend && npm run dev');
        // Don't throw - Playwright webServer config will start it
        console.log('   (Playwright webServer may start it automatically)');
    }

    console.log('✅ E2E Global Setup complete');
}

export default globalSetup;
