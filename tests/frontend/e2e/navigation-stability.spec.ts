import { test, expect } from './fixtures/auth.fixture';
import { RisksPage } from './pages/RisksPage';
import { waitForDataLoad } from './helpers/wait';

const TARGET_RISK_NAME = 'Claims Reserve Inadequacy';

test.describe('Navigation Stability', () => {
    test('Sidebar navigation from risk detail unmounts stale page and avoids render-loop errors', async ({ croPage }) => {
        const maxDepthErrors: string[] = [];
        croPage.on('console', (msg) => {
            if (msg.type() === 'error' && msg.text().includes('Maximum update depth exceeded')) {
                maxDepthErrors.push(msg.text());
            }
        });

        const risksPage = new RisksPage(croPage);
        await risksPage.navigate();
        await risksPage.search(TARGET_RISK_NAME);
        await risksPage.openRowByText(TARGET_RISK_NAME);

        await expect(croPage.getByRole('heading', { name: TARGET_RISK_NAME }).first()).toBeVisible();
        await croPage.waitForTimeout(1000);
        expect(maxDepthErrors).toHaveLength(0);

        await croPage.locator('aside a[href="/vendors"]').first().click();
        await croPage.waitForURL(/\/vendors$/, { timeout: 15000 });
        await waitForDataLoad(croPage);

        // Locale-agnostic assertion: verify core vendors list UI is present.
        await expect(croPage.getByTestId('vendors-search-input')).toBeVisible();
        await expect(croPage.getByRole('heading', { name: TARGET_RISK_NAME })).toHaveCount(0);

        await croPage.waitForTimeout(1000);
        expect(maxDepthErrors).toHaveLength(0);
    });
});
