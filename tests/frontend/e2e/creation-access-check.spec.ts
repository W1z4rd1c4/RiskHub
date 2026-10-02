import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { renderedContrast } from './helpers/renderedContrast';

for (const theme of ['light', 'riskhub', 'dark']) for (const locale of ['en', 'cs']) for (const width of [1024, 1440]) {
    test(`${theme} ${locale} ${width}: creation read errors remain closed and keyboard retryable`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let riskAttempts = 0;
        let vendorAttempts = 0;
        await page.route('**/api/v1/auth/config', route => route.fulfill({ json: {
            auth_mode: 'hybrid_dev', demo_login_enabled: true, password_login_enabled: false,
            sso: { enabled: false, provider: 'entra', scopes: [] },
        } }));
        await page.route('**/api/v1/risks?**', async route => {
            riskAttempts++;
            await route.fulfill(riskAttempts === 1 ? { status: 500, json: { detail: 'private diagnostic' } } : { json: {
                items: [], total: 0, offset: 0, limit: 1, capabilities: { can_create: true },
            } });
        });
        await page.route('**/api/v1/vendors/7', async route => {
            vendorAttempts++;
            // Independently exercise linked-vendor failure after the create gate succeeds.
            await route.fulfill({ status: vendorAttempts < 3 ? 500 : 404, json: { detail: 'private vendor diagnostic' } });
        });
        await page.goto(`/access-check.html?theme=${theme}&locale=${locale}`);
        const retryName = locale === 'en' ? 'Retry' : 'Zkusit znovu';
        const failedText = locale === 'en' ? 'Could not check access. Please try again.' : 'Přístup se nepodařilo ověřit. Zkuste to znovu.';
        const retry = page.getByRole('button', { name: retryName, exact: true });
        await expect(page.getByRole('alert')).toContainText(failedText);
        await expect(page.locator('form')).toHaveCount(0);
        await expect(page.getByText('private', { exact: false })).toHaveCount(0);
        expect(await renderedContrast(page.getByRole('alert').getByText(failedText))).toBeGreaterThanOrEqual(4.5);
        expect(await renderedContrast(retry)).toBeGreaterThanOrEqual(4.5);
        await retry.hover();
        expect(await renderedContrast(retry)).toBeGreaterThanOrEqual(4.5);
        await retry.focus();
        await expect(retry).toBeFocused();
        await page.keyboard.press('Enter');
        await expect.poll(() => riskAttempts).toBe(2);
        await expect.poll(() => vendorAttempts).toBe(2);
        await expect(page.getByRole('alert')).toContainText(failedText);
        await expect(page.locator('form')).toHaveCount(0);
        await retry.focus();
        await page.keyboard.press('Space');
        await expect.poll(() => vendorAttempts).toBe(3);
        await expect(retry).toHaveCount(0);
        expect(riskAttempts).toBe(2);
        await expect(page.getByRole('alert')).not.toContainText(failedText);
        await expect(page.locator('form')).toHaveCount(0);
        // The linked-vendor 404 is a denial (AccessDeniedState, announced): heading + explanation.
        const deniedText = page.getByRole('alert').locator('h2, p');
        await expect(deniedText).toHaveCount(2);
        for (const text of await deniedText.all()) {
            expect(await renderedContrast(text)).toBeGreaterThanOrEqual(4.5);
        }
        const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(axe.violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
}

for (const failedGate of ['create', 'vendor']) {
    test(`${failedGate} gate: pending retry exposes the real form only after permission is confirmed`, async ({ page }) => {
        let attempts = 0;
        let release!: () => void;
        const pending = new Promise<void>(resolve => { release = resolve; });
        await page.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { detail: 'unused form lookup' } }));
        await page.route('**/api/v1/auth/config', route => route.fulfill({ json: {
            auth_mode: 'hybrid_dev', demo_login_enabled: true, password_login_enabled: false,
            sso: { enabled: false, provider: 'entra', scopes: [] },
        } }));
        const vendor = {
            id: 7, name: 'Vendor', process: 'Claims', outsourcing_owner_user_id: 1,
            linked_risks: [], capabilities: {
                can_read: true, can_update: false, can_archive: false, can_restore: false,
                can_create_linked_risk: true, can_create_linked_control: false, can_create_linked_kri: false,
                can_link_risk: false, can_link_control: false, can_link_kri: false,
                can_view_linked_risks: false, can_view_linked_controls: false, can_view_linked_kris: false,
                can_create_issue: false, can_view_contracts: false, can_manage_contracts: false,
                can_view_sub_outsourcing: false, can_manage_sub_outsourcing: false,
                can_view_asset_links: false, can_manage_asset_links: false, can_manage_process_links: false,
            }, vendor_type: 'ict',
            risk_score_1_5: 1, supports_important_core_insurance_function: false,
            dora_relevant: false, is_significant_vendor: false, has_alternative_providers: true,
            is_archived: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        };
        for (const kind of ['create', 'vendor']) {
            await page.route(kind === 'create' ? '**/api/v1/risks?**' : '**/api/v1/vendors/7', async route => {
                if (kind === failedGate) {
                    attempts++;
                    if (attempts === 1) { await route.fulfill({ status: 500, json: { detail: 'temporary' } }); return; }
                    await pending;
                }
                await route.fulfill({ json: kind === 'vendor' ? vendor : {
                    items: [], total: 0, offset: 0, limit: 1, capabilities: { can_create: true },
                } });
            });
        }
        await page.goto('/access-check.html?theme=light&locale=en');
        const url = page.url();
        await expect(page.getByRole('alert')).toContainText('Could not check access');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        // LoadingState: the polite status carries the label; the spinner placeholder is the busy element.
        await expect(page.locator('[data-loading-placeholder]')).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByRole('status')).toContainText('Checking access');
        await expect(page.locator('form')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
        const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(axe.violations).toEqual([]);
        release();
        await expect(page.locator('form')).toBeVisible();
        expect(attempts).toBe(2);
        expect(page.url()).toBe(url);
    });
}
