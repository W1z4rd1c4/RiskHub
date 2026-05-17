/**
 * Playwright Global Setup
 *
 * Runs before all tests to verify backend and frontend are healthy.
 * Called once per test run via playwright.config.ts globalSetup.
 */

import { FullConfig } from '@playwright/test';
import { verifyDeterministicE2EData } from './test-data';

async function globalSetup(config: FullConfig): Promise<void> {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const frontendUrl = config.projects[0]?.use?.baseURL || 'http://localhost:5173';

    console.log('🔍 E2E Global Setup: Verifying services...');

    // Check backend readiness
    try {
        const backendResponse = await fetch(`${backendUrl}/api/v1/readyz`);
        if (!backendResponse.ok) {
            throw new Error(`Backend readiness check failed: ${backendResponse.status}`);
        }
        console.log('✅ Backend is ready');
    } catch (error) {
        console.error('❌ Backend readiness check failed:', error);
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

    console.log('🔍 Verifying deterministic E2E seed fixtures...');
    const preflight = await verifyDeterministicE2EData();
    if (!preflight.ok) {
        console.error('❌ Deterministic E2E seed preflight failed.');
        if (preflight.missing.length > 0) {
            console.error('   Missing fixtures:');
            for (const fixture of preflight.missing) {
                console.error(`   - ${fixture}`);
            }
        }
        console.error('   Run deterministic reset first: ./scripts/compose.sh reset --dataset test');
        console.error('   Manual fallback: cd backend && venv/bin/python -m scripts.seed_e2e_all');
        throw new Error('Required deterministic E2E fixtures are missing.');
    }
    console.log(
        `✅ Deterministic fixtures verified (risks=${preflight.counts.risks}, controls=${preflight.counts.controls}, KRIs=${preflight.counts.kris}, vendors=${preflight.counts.vendors}, approvals_pending=${preflight.counts.approvals_pending}, approvals_my_requests=${preflight.counts.approvals_my_requests}, activity_seeded=${preflight.counts.activity_seeded})`,
    );

    console.log('✅ E2E Global Setup complete');
}

export default globalSetup;
