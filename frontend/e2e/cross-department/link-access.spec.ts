import { test, expect } from '../fixtures/auth.fixture';
import { E2E_CONTROLS, E2E_RISKS } from '../fixtures/e2e-data';
import { RisksPage } from '../pages/RisksPage';
import { waitForDataLoad } from '../helpers/wait';

test.describe('Risk-Control Linking Access (Deterministic)', () => {
    test('Risk Manager link dialog defaults include-archived off', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);
        await risksPage.openRowByText(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);

        const linkExistingButton = riskManagerPage.locator('button:has-text("Link Existing"), button:has-text("Link Control")').first();
        await expect(linkExistingButton).toBeVisible();
        await linkExistingButton.click();

        const dialog = riskManagerPage.locator('[data-testid="link-management-dialog"], [role="dialog"]').first();
        await expect(dialog).toBeVisible();

        const includeArchivedCheckbox = dialog.locator('label:has(input[type="checkbox"]) input[type="checkbox"]').first();
        await expect(includeArchivedCheckbox).not.toBeChecked();
    });

    test('Archived control candidate appears in link search only with include archived enabled', async ({ riskManagerPage }) => {
        const risksPage = new RisksPage(riskManagerPage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);
        await risksPage.openRowByText(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);

        const linkExistingButton = riskManagerPage.locator('button:has-text("Link Existing"), button:has-text("Link Control")').first();
        await linkExistingButton.click();

        const dialog = riskManagerPage.locator('[data-testid="link-management-dialog"], [role="dialog"]').first();
        await expect(dialog).toBeVisible();

        const searchInput = dialog.locator('input[placeholder*="Search"], input[type="text"]').first();
        const initialSearchResponse = riskManagerPage.waitForResponse((response) => {
            const url = response.url();
            return url.includes('/api/v1/controls')
                && url.includes('search=')
                && url.includes('E2E-ARCH-CTRL')
                && !url.includes('include_archived=true');
        });
        await searchInput.fill(E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name);
        await initialSearchResponse;
        await waitForDataLoad(riskManagerPage);

        const archivedCandidate = dialog.locator('button').filter({ hasText: E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name }).first();
        await expect(archivedCandidate).toHaveCount(0);

        const includeArchivedCheckbox = dialog.locator('label:has(input[type="checkbox"]) input[type="checkbox"]').first();
        const includeArchivedSearchResponse = riskManagerPage.waitForResponse((response) => {
            const url = response.url();
            return url.includes('/api/v1/controls')
                && url.includes('search=')
                && url.includes('E2E-ARCH-CTRL')
                && url.includes('include_archived=true');
        });
        await includeArchivedCheckbox.click();
        await expect(includeArchivedCheckbox).toBeChecked();
        await includeArchivedSearchResponse;
        await waitForDataLoad(riskManagerPage);

        const archivedResult = dialog.locator('button').filter({ hasText: E2E_CONTROLS.ARCHIVE_RESTORE_TARGET.name }).first();
        await expect(archivedResult).toBeVisible({ timeout: 15000 });
        await expect(archivedResult).toContainText(/Archived/i);
    });

    test('Employee without risks:write does not see link existing action', async ({ employeePage }) => {
        const risksPage = new RisksPage(employeePage);
        await risksPage.navigate();
        await risksPage.search(E2E_RISKS.PENDING_DELETE_APPROVAL.name);
        await risksPage.openRowByText(E2E_RISKS.PENDING_DELETE_APPROVAL.name);

        const linkExistingButton = employeePage.locator('button:has-text("Link Existing"), button:has-text("Link Control")').first();
        await expect(linkExistingButton).toHaveCount(0);
    });
});
