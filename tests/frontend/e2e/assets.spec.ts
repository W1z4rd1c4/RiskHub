/**
 * ICT Register — Asset register E2E (issues #43 + #48, deterministic fixtures).
 *
 * Asserts CURRENT behavior: entered 04_Aktiva fields round-trip through
 * the UI, closed lists come verbatim from the workbook reference registry,
 * Process<->Asset links carry at most one primary designation per asset, and
 * Asset<->Asset links are directional. The ENGINE-DERIVED values (CIAA value,
 * weighted score, resulting criticality, CIF, SPOF rollups — ticket #48)
 * render read-only on the register and the detail, never as inputs.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ASSETS, E2E_PROCESSES } from './fixtures/e2e-data';
import {
    createAssetViaApi,
    ensureAssetArchived,
    ensureAssetPrimaryProcess,
    getAssetByName,
    getProcessByL1,
    postAssetExpectingStatus,
    resetAssetAssetLinks,
    resetAssetProcessLinks,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';
import { AssetsPage } from './pages/AssetsPage';

// TypAktiva — verbatim workbook closed list (docs/dora-ict-register spec section 3.1).
const TYP_AKTIVA = [
    'Aplikace',
    'Databáze',
    'Infrastruktura',
    'Síťový prvek',
    'Hardware',
    'Cloud služba',
    'Datové úložiště',
    'Informační aktivum',
    'Bezpečnostní aktivum',
    'BCM/DR aktivum',
    'Jiné',
];
const SKALA_15 = ['1', '2', '3', '4', '5'];

const ARCHIVE_CONFIRM_BUTTON = /^(Archive|Archivovat)$/;
const PRIMARY_BADGE_SELECTOR = '[data-testid^="asset-process-link-primary-"]';

test.describe('ICT Register — Assets (Deterministic)', () => {
    test('Risk manager sees Assets in the sidebar and navigates to the register', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/');
        const navLink = riskManagerPage.locator('nav a[href="/assets"]');
        await expect(navLink).toBeVisible();

        await navLink.click();
        await riskManagerPage.waitForURL(/.*assets$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('assets-search-input')).toBeVisible();
        await expect(riskManagerPage.getByTestId('assets-create-button')).toBeVisible();
    });

    test('Employee sees the register read-only: no create, edit, archive, or link management', async ({ employeePage }) => {
        await employeePage.goto('/');
        await expect(employeePage.locator('nav a[href="/assets"]')).toBeVisible();

        const assetsPage = new AssetsPage(employeePage);
        await assetsPage.navigate();
        await assetsPage.search(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
        await expect(assetsPage.rowByText(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name)).toBeVisible();
        await expect(assetsPage.createButton).toHaveCount(0);

        await assetsPage.openRowByText(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
        await expect(employeePage.getByTestId('asset-detail-back')).toBeVisible();
        await expect(employeePage.getByTestId('asset-detail-edit')).toHaveCount(0);
        await expect(employeePage.getByTestId('asset-detail-archive')).toHaveCount(0);
        // Link sections render read-only: seeded links visible, no mutation controls.
        await expect(employeePage.getByTestId('asset-process-links')).toBeVisible();
        await expect(employeePage.getByTestId('asset-process-link-add')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="asset-process-link-set-primary-"]')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="asset-process-link-remove-"]')).toHaveCount(0);
    });

    test('Platform admin does not see Assets navigation', async ({ adminPage }) => {
        // Anchor on the admin-only console link before asserting the absence.
        await expect(adminPage.locator('a[href="/admin"]').first()).toBeVisible();
        await expect(adminPage.locator('a[href="/assets"]')).toHaveCount(0);
    });

    test('Register lists the seeded deterministic assets with search narrowing', async ({ riskManagerPage }) => {
        const assetsPage = new AssetsPage(riskManagerPage);
        await assetsPage.navigate();
        await assetsPage.search('E2E-ASSET');

        await expect(assetsPage.rowByText(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name)).toBeVisible();
        await expect(assetsPage.rowByText(E2E_ASSETS.CLAIMS_DATABASE.name)).toBeVisible();
        // The seeded asset type renders verbatim in the register column.
        await expect(
            assetsPage.rowByText(E2E_ASSETS.CLAIMS_DATABASE.name).getByText('Databáze', { exact: true }),
        ).toBeVisible();

        await assetsPage.search(E2E_ASSETS.CLAIMS_DATABASE.name);
        await expect(assetsPage.rowByText(E2E_ASSETS.CLAIMS_DATABASE.name)).toBeVisible();
        await expect(assetsPage.tableRows.filter({ hasText: E2E_ASSETS.CORE_CLAIMS_SYSTEM.name })).toHaveCount(0);
    });

    test('Archived asset appears only under the Archived status filter', async ({ riskManagerPage }) => {
        const archivedId = await ensureAssetArchived(E2E_ASSETS.ARCHIVED.name, true);

        const assetsPage = new AssetsPage(riskManagerPage);
        await assetsPage.navigate();
        await assetsPage.search(E2E_ASSETS.ARCHIVED.name);
        await expect(assetsPage.tableRows.filter({ hasText: E2E_ASSETS.ARCHIVED.name })).toHaveCount(0);

        await assetsPage.setStatusFilterArchived();
        await expect(assetsPage.rowByText(E2E_ASSETS.ARCHIVED.name)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`asset-restore-${archivedId}`)).toBeVisible();
    });

    test('Create flow offers verbatim workbook closed lists and lands on the new detail', async ({ riskManagerPage }) => {
        const uniqueName = `E2E-ASSET-UI Created ${Date.now()}`;

        const assetsPage = new AssetsPage(riskManagerPage);
        await assetsPage.navigate();
        await assetsPage.createButton.click();
        await riskManagerPage.waitForURL(/.*assets\/new$/);

        // Asset type dropdown carries the TypAktiva workbook list verbatim.
        await riskManagerPage.getByTestId('asset-form-asset-type').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(TYP_AKTIVA.length + 1); // + "Not set"
        for (const value of TYP_AKTIVA) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: 'Aplikace', exact: true }).click();

        // CIAA rating dropdown carries Skala15 verbatim (1–5 only).
        await riskManagerPage.getByTestId('asset-form-confidentiality-rating').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(SKALA_15.length + 1);
        await riskManagerPage.getByRole('option', { name: '5', exact: true }).click();

        await riskManagerPage.getByTestId('asset-form-name').fill(uniqueName);
        await riskManagerPage.getByTestId('asset-form-submit').click();

        await riskManagerPage.waitForURL(/.*assets\/\d+$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.locator('h1').first()).toContainText(uniqueName);
        await expect(riskManagerPage.getByText('Aplikace', { exact: true }).first()).toBeVisible();
    });

    test('Whitespace-only asset name surfaces the required-field validation error', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/assets/new');
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('asset-form-name').fill('   ');
        await riskManagerPage.getByTestId('asset-form-submit').click();

        await expect(
            riskManagerPage.getByText(/Asset name is required|Název aktiva je povinný/),
        ).toBeVisible();
        await expect(riskManagerPage).toHaveURL(/.*assets\/new$/);
    });

    test('CIAA ratings outside the 1–5 Skala15 scale are rejected', async ({ riskManagerPage }) => {
        // The form cannot offer an out-of-range rating: the dropdown is the
        // closed Skala15 list (exactly 1–5, no 0 or 6).
        await riskManagerPage.goto('/assets/new');
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('asset-form-availability-rating').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(SKALA_15.length + 1);
        for (const value of SKALA_15) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await expect(riskManagerPage.getByRole('option', { name: '0', exact: true })).toHaveCount(0);
        await expect(riskManagerPage.getByRole('option', { name: '6', exact: true })).toHaveCount(0);
        await riskManagerPage.keyboard.press('Escape');

        // The API boundary rejects out-of-range and non-strict-int ratings (422).
        expect(
            await postAssetExpectingStatus({
                name: `E2E-ASSET-INVALID ${Date.now()}`,
                confidentiality_rating: 7,
            }),
        ).toBe(422);
        expect(
            await postAssetExpectingStatus({
                name: `E2E-ASSET-INVALID ${Date.now()}`,
                impact_client: '3',
            }),
        ).toBe(422);
    });

    test('Edit round-trip persists entered field changes', async ({ riskManagerPage }) => {
        const created = await createAssetViaApi({
            name: `E2E-ASSET-EDIT ${Date.now()}`,
        });

        await riskManagerPage.goto(`/assets/${created.id}/edit`);
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('asset-form-ict-owner').fill('E2E Edited ICT Owner');
        await riskManagerPage.getByTestId('asset-form-lifecycle-state').click();
        await riskManagerPage.getByRole('option', { name: 'V provozu', exact: true }).click();
        await riskManagerPage.getByTestId('asset-form-submit').click();

        await riskManagerPage.waitForURL(new RegExp(`/assets/${created.id}$`));
        // Hard reload: the SPA detail cache holds the pre-edit copy for up to
        // 30s (DETAIL_QUERY_STALE_TIME_MS); a fresh document proves persistence.
        await riskManagerPage.goto(`/assets/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByText('E2E Edited ICT Owner', { exact: true })).toBeVisible();
        await expect(riskManagerPage.getByText('V provozu', { exact: true }).first()).toBeVisible();
    });

    test('Archive and restore round-trip through the register UI', async ({ riskManagerPage }) => {
        const uniqueName = `E2E-ASSET-LC ${Date.now()}`;
        const created = await createAssetViaApi({ name: uniqueName });

        await riskManagerPage.goto(`/assets/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await riskManagerPage.getByTestId('asset-detail-archive').click();
        await riskManagerPage
            .locator('.confirm-dialog-actions')
            .getByRole('button', { name: ARCHIVE_CONFIRM_BUTTON })
            .click();
        await riskManagerPage.waitForURL(/.*assets$/);

        const assetsPage = new AssetsPage(riskManagerPage);
        await assetsPage.setStatusFilterArchived();
        await assetsPage.search(uniqueName);
        await expect(assetsPage.rowByText(uniqueName)).toBeVisible();

        // Hard reload: the SPA detail cache still holds the pre-archive copy
        // for up to 30s (DETAIL_QUERY_STALE_TIME_MS).
        await riskManagerPage.goto(`/assets/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('asset-detail-restore')).toBeVisible();
        await riskManagerPage.getByTestId('asset-detail-restore').click();

        await expect(riskManagerPage.getByTestId('asset-detail-archive')).toBeVisible();
        await expect(riskManagerPage.getByTestId('asset-detail-restore')).toHaveCount(0);
    });

    test('Seeded links render: exactly one primary Process badge and directional asset links', async ({ riskManagerPage }) => {
        const asset = await getAssetByName(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
        const primaryProcess = await getProcessByL1(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        expect(asset).not.toBeNull();
        expect(primaryProcess).not.toBeNull();
        // Repair any drift a previously interrupted run left behind.
        await ensureAssetPrimaryProcess(asset!.id, primaryProcess!.id);

        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(riskManagerPage);

        const processLinks = riskManagerPage.getByTestId('asset-process-links');
        await expect(processLinks).toBeVisible();
        await expect(processLinks.getByText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process).first()).toBeVisible();
        await expect(processLinks.getByText(E2E_PROCESSES.POLICY_ADMIN.l1_process).first()).toBeVisible();
        // Exactly one primary designation, and it sits on the seeded primary Process.
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(1);
        await expect(
            riskManagerPage.getByTestId(`asset-process-link-primary-${primaryProcess!.id}`),
        ).toBeVisible();

        const assetLinks = riskManagerPage.getByTestId('asset-asset-links');
        await expect(assetLinks).toBeVisible();
        await expect(assetLinks.getByText(E2E_ASSETS.CLAIMS_DATABASE.name).first()).toBeVisible();
        await expect(assetLinks.getByText(E2E_ASSETS.INTEGRATION_BUS.name).first()).toBeVisible();

        // Ticket #48: the engine-derived block reflects the seeded graph
        // read-only. E2E-ASSET-001's primary Process (E2E-PROC-001, score 17)
        // is Kritická and its own weighted score 4.05 bands Kritická too, so
        // the MAX cascade lands on Kritická; CIF is Ano by any-true across the
        // linked Processes (E2E-PROC-001 carries the seeded CIF override).
        const derivedSection = riskManagerPage.getByTestId('asset-derived-section');
        await expect(derivedSection).toBeVisible();
        await expect(derivedSection.getByTestId('asset-derived-resulting-criticality')).toContainText('Kritická');
        await expect(derivedSection.getByTestId('asset-derived-cif')).toHaveText('Ano');
    });

    test('Process link management: add, set primary, swap primary, remove', async ({ riskManagerPage }) => {
        const asset = await getAssetByName(E2E_ASSETS.INTEGRATION_BUS.name);
        const processA = await getProcessByL1(E2E_PROCESSES.REGULATORY_REPORTING.l1_process);
        const processB = await getProcessByL1(E2E_PROCESSES.PORTAL_SUPPORT.l1_process);
        expect(asset).not.toBeNull();
        expect(processA).not.toBeNull();
        expect(processB).not.toBeNull();
        // Deterministic baseline: this asset owns no links at test start.
        await resetAssetProcessLinks(asset!.id);

        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(riskManagerPage);

        // Add a first Process link with closed-list metadata.
        await riskManagerPage.getByTestId('asset-process-link-select').click();
        await riskManagerPage.getByRole('option', { name: /E2E-PROC-003/ }).click();
        await riskManagerPage.getByTestId('asset-process-link-significance').click();
        await riskManagerPage.getByRole('option', { name: 'BCM/DR vazba', exact: true }).click();
        await riskManagerPage.getByTestId('asset-process-link-add').click();

        const processLinks = riskManagerPage.getByTestId('asset-process-links');
        await expect(processLinks.getByText(E2E_PROCESSES.REGULATORY_REPORTING.l1_process).first()).toBeVisible();
        await expect(processLinks.getByText('BCM/DR vazba').first()).toBeVisible();
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(0);

        // Add a second Process link.
        await riskManagerPage.getByTestId('asset-process-link-select').click();
        await riskManagerPage.getByRole('option', { name: /E2E-PROC-004/ }).click();
        await riskManagerPage.getByTestId('asset-process-link-add').click();
        await expect(processLinks.getByText(E2E_PROCESSES.PORTAL_SUPPORT.l1_process).first()).toBeVisible();

        // Designate the first link as primary.
        await riskManagerPage.getByTestId(`asset-process-link-set-primary-${processA!.id}`).click();
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${processA!.id}`)).toBeVisible();
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(1);

        // Swap primary to the second link — the old badge atomically demotes.
        await riskManagerPage.getByTestId(`asset-process-link-set-primary-${processB!.id}`).click();
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${processB!.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${processA!.id}`)).toHaveCount(0);
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(1);

        // Remove both links; the section returns to its empty state.
        await riskManagerPage.getByTestId(`asset-process-link-remove-${processA!.id}`).click();
        await expect(riskManagerPage.getByTestId(`asset-process-link-remove-${processA!.id}`)).toHaveCount(0);
        await riskManagerPage.getByTestId(`asset-process-link-remove-${processB!.id}`).click();
        await expect(
            riskManagerPage.getByText(/No Processes linked yet|Zatím žádné vazby na procesy/),
        ).toBeVisible();
    });

    test('Asset link management: add a directional dependency and remove it', async ({ riskManagerPage }) => {
        const asset = await getAssetByName(E2E_ASSETS.REPORTING_WAREHOUSE.name);
        expect(asset).not.toBeNull();
        // Deterministic baseline: this asset owns no asset links at test start.
        await resetAssetAssetLinks(asset!.id);

        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('asset-asset-link-select').click();
        await riskManagerPage.getByRole('option', { name: /E2E-ASSET-002/ }).click();
        await riskManagerPage.getByTestId('asset-asset-link-dependency-type').click();
        await riskManagerPage.getByRole('option', { name: 'Datová', exact: true }).click();
        await riskManagerPage.getByTestId('asset-asset-link-add').click();

        const assetLinks = riskManagerPage.getByTestId('asset-asset-links');
        const linkRow = assetLinks.locator('li').filter({ hasText: E2E_ASSETS.CLAIMS_DATABASE.name }).first();
        await expect(linkRow).toBeVisible();
        // Directional: this asset is the dependent side of the new link.
        await expect(linkRow.getByText(/Depends on|Závisí na/)).toBeVisible();
        await expect(linkRow.getByText('Datová', { exact: true })).toBeVisible();

        await linkRow.locator('[data-testid^="asset-asset-link-remove-"]').click();
        await expect(
            riskManagerPage.getByText(/No Asset links yet|Zatím žádné vazby mezi aktivy/),
        ).toBeVisible();
    });
});
