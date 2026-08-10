/**
 * ICT Register — Asset register E2E (issues #43 + #48, deterministic fixtures).
 *
 * Asserts CURRENT behavior: entered 04_Aktiva fields round-trip through
 * the UI, stable controlled codes render as localized labels,
 * Process<->Asset links carry at most one primary designation per asset, and
 * Asset<->Asset links are directional. The ENGINE-DERIVED values (CIAA value,
 * weighted score, resulting criticality, CIF, SPOF rollups — ticket #48)
 * render read-only on the register and the detail, never as inputs.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ASSETS, E2E_PROCESSES } from './fixtures/e2e-data';
import {
    cleanupWithoutMaskingPrimaryFailure,
    createAssetViaApi,
    ensureAssetArchived,
    ensureAssetPrimaryProcess,
    getApprovalScenario,
    getAssetByName,
    getProcessByL1,
    removeAssetAssetLinkTuple,
    postAssetExpectingStatus,
    resetAssetProcessLinks,
    runCleanupSteps,
    updateApprovalScenario,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { AssetsPage } from './pages/AssetsPage';

const ASSET_TYPE_LABELS = [
    'Application',
    'Database',
    'Infrastructure',
    'Network component',
    'Hardware',
    'Cloud service',
    'Data storage',
    'Information asset',
    'Security asset',
    'BCM/DR asset',
    'Other',
];
const SKALA_15 = ['1', '2', '3', '4', '5'];

const ARCHIVE_CONFIRM_BUTTON = /^(Archive|Archivovat)$/;
const PRIMARY_BADGE_SELECTOR = '[data-testid^="asset-process-link-primary-"]';
const OWNER_PERSONAS = [
    {
        account: DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS,
        unrelatedAsset: E2E_ASSETS.INTEGRATION_BUS,
    },
    {
        account: DEMO_ACCOUNTS.EMPLOYEE_IT,
        unrelatedAsset: E2E_ASSETS.CLAIMS_DATABASE,
    },
] as const;

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

    test('Employee sees the register read-only: no create, edit, archive, or link management', async ({
        employeePage,
    }) => {
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

    test('distinct cross-department owners can list, safely read, and edit without lifecycle powers', async ({
        browser,
    }) => {
        test.slow();
        const asset = await getAssetByName(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
        const archivedAsset = await getAssetByName(E2E_ASSETS.OWNER_SCOPED_ARCHIVED.name);
        expect(asset).not.toBeNull();
        expect(archivedAsset).not.toBeNull();

        for (const { account, unrelatedAsset } of OWNER_PERSONAS) {
            const unrelated = await getAssetByName(unrelatedAsset.name);
            expect(unrelated).not.toBeNull();
            const context = await browser.newContext();
            const page = await context.newPage();
            try {
                await loginAsDemoUser(page, account);

                const assetsPage = new AssetsPage(page);
                await assetsPage.navigate();
                await assetsPage.search(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
                await expect(assetsPage.rowByText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name)).toBeVisible();
                await expect(assetsPage.createButton).toHaveCount(0);

                await assetsPage.openRowByText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
                await expect(page.locator('main h1').first()).toContainText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
                await expect(page.getByText('Cloud service', { exact: true }).first()).toBeVisible();
                await expect(page.getByText('Supporting', { exact: true }).first()).toBeVisible();
                await expect(page.getByText('SaaS', { exact: true }).first()).toBeVisible();

                const ownership = page.locator('.glass-card').filter({
                    has: page.getByRole('heading', {
                        name: /^(Ownership and regulation|Vlastnictví a regulace)$/,
                    }),
                });
                await expect(ownership).toContainText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.business_owner_name);
                await expect(ownership).toContainText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.ict_owner_name);
                await expect(ownership).toContainText('Operations · employee');
                await expect(ownership).toContainText('IT · employee');
                await expect(ownership).toContainText('Finance (FIN)');
                await expect(ownership).not.toContainText(/@riskhub\.local/i);
                await expect(ownership).not.toContainText(/\b(?:user|owner|department)\s*#?\d+\b/i);

                await expect(page.getByTestId('asset-detail-edit')).toBeVisible();
                await expect(page.getByTestId('asset-detail-archive')).toHaveCount(0);
                await expect(page.getByTestId('asset-detail-restore')).toHaveCount(0);
                await page.getByTestId('asset-detail-edit').click();
                await expect(page).toHaveURL(new RegExp(`/assets/${asset!.id}/edit$`));
                await expect(page.getByTestId('asset-form-submit')).toBeVisible();

                await page.goto('/assets/new');
                await expect(page.getByText('Access Denied', { exact: true })).toBeVisible();
                await expect(page.getByTestId('asset-form-submit')).toHaveCount(0);

                await assetsPage.navigate();
                await assetsPage.search(unrelatedAsset.name);
                await expect(assetsPage.tableRows.filter({ hasText: unrelatedAsset.name })).toHaveCount(0);
                await page.goto(`/assets/${unrelated!.id}`);
                await expect(page.getByText(/Asset not found\.|Aktivum nenalezeno\./)).toBeVisible();
                await page.goto(`/assets/${unrelated!.id}/edit`);
                await expect(page.getByTestId('asset-form-submit')).toHaveCount(0);

                await assetsPage.navigate();
                await assetsPage.setStatusFilterArchived();
                await assetsPage.search(E2E_ASSETS.OWNER_SCOPED_ARCHIVED.name);
                await expect(assetsPage.rowByText(E2E_ASSETS.OWNER_SCOPED_ARCHIVED.name)).toBeVisible();
                await assetsPage.openRowByText(E2E_ASSETS.OWNER_SCOPED_ARCHIVED.name);
                await expect(page.getByTestId('asset-detail-edit')).toHaveCount(0);
                await expect(page.getByTestId('asset-detail-archive')).toHaveCount(0);
                await expect(page.getByTestId('asset-detail-restore')).toHaveCount(0);
            } finally {
                await context.close();
            }
        }
    });

    test('Finance Owning Department head can read and edit the cross-department Asset but cannot create or archive', async ({
        browser,
    }) => {
        const asset = await getAssetByName(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
        expect(asset).not.toBeNull();

        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_FINANCE);
        const assetsPage = new AssetsPage(page);
        await assetsPage.navigate();
        await assetsPage.search(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
        await expect(assetsPage.rowByText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name)).toBeVisible();
        await expect(assetsPage.createButton).toHaveCount(0);

        await assetsPage.openRowByText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
        await expect(
            page.getByText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.business_owner_name, {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByText(E2E_ASSETS.OWNER_SCOPED_ACTIVE.ict_owner_name, {
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByTestId('asset-detail-edit')).toBeVisible();
        await expect(page.getByTestId('asset-detail-archive')).toHaveCount(0);

        await page.getByTestId('asset-detail-edit').click();
        await expect(page).toHaveURL(new RegExp(`/assets/${asset!.id}/edit$`));
        await expect(page.getByTestId('asset-form-submit')).toBeVisible();
        await context.close();
    });

    test('unrelated Operations head cannot enumerate, read, or edit the Finance-owned Asset', async ({
        deptHeadPage,
    }) => {
        const asset = await getAssetByName(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
        expect(asset).not.toBeNull();

        const assetsPage = new AssetsPage(deptHeadPage);
        await assetsPage.navigate();
        await assetsPage.search(E2E_ASSETS.OWNER_SCOPED_ACTIVE.name);
        await expect(
            assetsPage.tableRows.filter({
                hasText: E2E_ASSETS.OWNER_SCOPED_ACTIVE.name,
            }),
        ).toHaveCount(0);

        await deptHeadPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(deptHeadPage);
        await expect(deptHeadPage.getByText(/Asset not found\.|Aktivum nenalezeno\./)).toBeVisible();
        await expect(deptHeadPage.locator('main h1')).toHaveCount(0);
        await expect(deptHeadPage.getByTestId('asset-detail-edit')).toHaveCount(0);
        await expect(deptHeadPage.getByTestId('asset-detail-archive')).toHaveCount(0);

        await deptHeadPage.goto(`/assets/${asset!.id}/edit`);
        await waitForDataLoad(deptHeadPage);
        await expect(deptHeadPage.getByTestId('asset-form-submit')).toHaveCount(0);
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
        // Canonical `database` renders through the current locale.
        await expect(
            assetsPage.rowByText(E2E_ASSETS.CLAIMS_DATABASE.name).getByText('Database', { exact: true }),
        ).toBeVisible();

        await assetsPage.search(E2E_ASSETS.CLAIMS_DATABASE.name);
        await expect(assetsPage.rowByText(E2E_ASSETS.CLAIMS_DATABASE.name)).toBeVisible();
        await expect(
            assetsPage.tableRows.filter({
                hasText: E2E_ASSETS.CORE_CLAIMS_SYSTEM.name,
            }),
        ).toHaveCount(0);
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

    test('Create flow uses canonical localized values and permits same-user, cross-department ownership', async ({
        riskManagerPage,
    }) => {
        const uniqueName = `E2E-ASSET-UI Created ${Date.now()}`;

        const assetsPage = new AssetsPage(riskManagerPage);
        await assetsPage.navigate();
        await assetsPage.createButton.click();
        await riskManagerPage.waitForURL(/.*assets\/new$/);

        // Runtime choices are localized labels backed by stable canonical codes.
        await riskManagerPage.getByTestId('asset-form-asset-type').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(ASSET_TYPE_LABELS.length + 1); // + "Not set"
        for (const value of ASSET_TYPE_LABELS) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: 'Application', exact: true }).click();

        for (const field of ['business-owner', 'ict-owner'] as const) {
            await riskManagerPage.getByTestId(`asset-form-${field}-search`).fill('ops.analyst@riskhub.local');
            await riskManagerPage.getByTestId(`asset-form-${field}`).click();
            await riskManagerPage.getByRole('option', { name: /ops\.analyst@riskhub\.local/i }).click();
        }
        // Department is independent from both people and may be cross-department.
        await riskManagerPage.getByTestId('asset-form-owner-department-search').fill('Finance');
        await riskManagerPage.getByTestId('asset-form-owner-department').click();
        await riskManagerPage.getByRole('option', { name: /Finance \(FIN\)/ }).click();

        // CIAA rating dropdown carries Skala15 verbatim (1–5 only).
        await riskManagerPage.getByTestId('asset-form-confidentiality-rating').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(SKALA_15.length + 1);
        await riskManagerPage.getByRole('option', { name: '5', exact: true }).click();

        await riskManagerPage.getByTestId('asset-form-name').fill(uniqueName);
        await riskManagerPage.getByTestId('asset-form-submit').click();

        await riskManagerPage.waitForURL(/.*assets\/\d+$/);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.locator('main h1').first()).toContainText(uniqueName);
        await expect(riskManagerPage.getByText('Application', { exact: true }).first()).toBeVisible();
        await expect(riskManagerPage.getByText('Jana Horáková', { exact: true }).first()).toBeVisible();
        await expect(riskManagerPage.getByText('Finance (FIN)', { exact: true })).toBeVisible();
    });

    test('Whitespace-only asset name surfaces the required-field validation error', async ({ riskManagerPage }) => {
        await riskManagerPage.goto('/assets/new');
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('asset-form-name').fill('   ');
        await riskManagerPage.getByTestId('asset-form-submit').click();

        await expect(riskManagerPage.getByText(/Asset name is required|Název aktiva je povinný/)).toBeVisible();
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
        // Czech workbook labels are import-only; runtime writes fail closed.
        expect(
            await postAssetExpectingStatus({
                name: `E2E-ASSET-INVALID ${Date.now()}`,
                asset_type: 'Aplikace',
            }),
        ).toBe(422);
    });

    test('Edit round-trip persists entered field changes', async ({ riskManagerPage }) => {
        const created = await createAssetViaApi({
            name: `E2E-ASSET-EDIT ${Date.now()}`,
        });

        await riskManagerPage.goto(`/assets/${created.id}/edit`);
        await waitForDataLoad(riskManagerPage);

        await riskManagerPage.getByTestId('asset-form-lifecycle-state').click();
        await riskManagerPage.getByRole('option', { name: 'Operational', exact: true }).click();
        await riskManagerPage.getByTestId('asset-form-submit').click();

        await riskManagerPage.waitForURL(new RegExp(`/assets/${created.id}$`));
        // A fresh document independently proves persistence as well as the edit cache update.
        await riskManagerPage.goto(`/assets/${created.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByText('Operational', { exact: true }).first()).toBeVisible();
    });

    test('Archive and restore round-trip through the register UI', async ({ riskManagerPage }) => {
        let primaryFailure: unknown;

        try {
            const assetId = await ensureAssetArchived(E2E_ASSETS.INTEGRATION_BUS.name, false);

            await riskManagerPage.goto(`/assets/${assetId}`);
            await waitForDataLoad(riskManagerPage);
            await riskManagerPage.getByTestId('asset-detail-archive').click();
            await riskManagerPage
                .getByRole('alertdialog')
                .getByRole('textbox')
                .fill('E2E direct archive lifecycle verification');
            await riskManagerPage
                .locator('.confirm-dialog-actions')
                .getByRole('button', { name: ARCHIVE_CONFIRM_BUTTON })
                .click();
            await riskManagerPage.waitForURL(/.*assets$/);

            const assetsPage = new AssetsPage(riskManagerPage);
            await assetsPage.setStatusFilterArchived();
            await assetsPage.search(E2E_ASSETS.INTEGRATION_BUS.name);
            await expect(assetsPage.rowByText(E2E_ASSETS.INTEGRATION_BUS.name)).toBeVisible();

            // Hard reload: the SPA detail cache still holds the pre-archive copy
            // for up to 30s (DETAIL_QUERY_STALE_TIME_MS).
            await riskManagerPage.goto(`/assets/${assetId}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('asset-detail-restore')).toBeVisible();
            await riskManagerPage.getByTestId('asset-detail-restore').click();

            await expect(riskManagerPage.getByTestId('asset-detail-archive')).toBeVisible();
            await expect(riskManagerPage.getByTestId('asset-detail-restore')).toHaveCount(0);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                async () => {
                    await ensureAssetArchived(E2E_ASSETS.INTEGRATION_BUS.name, false);
                },
                test.info(),
            );
        }
    });

    test('Seeded links render: exactly one primary Process badge and directional asset links', async ({
        riskManagerPage,
    }) => {
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
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${primaryProcess!.id}`)).toBeVisible();

        const assetLinks = riskManagerPage.getByTestId('asset-asset-links');
        await expect(assetLinks).toBeVisible();
        await expect(assetLinks.getByText(E2E_ASSETS.CLAIMS_DATABASE.name).first()).toBeVisible();
        await expect(assetLinks.getByText(E2E_ASSETS.INTEGRATION_BUS.name).first()).toBeVisible();

        // Ticket #48: the engine-derived block reflects the seeded graph
        // read-only. E2E-ASSET-001's primary Process (E2E-PROC-001, score 17)
        // is critical and its own weighted score 4.05 bands critical too, so
        // the MAX cascade lands on critical; CIF is yes by any-true across the
        // linked Processes (E2E-PROC-001 carries the seeded CIF override).
        const derivedSection = riskManagerPage.getByTestId('asset-derived-section');
        await expect(derivedSection).toBeVisible();
        await expect(derivedSection.getByTestId('asset-derived-resulting-criticality')).toContainText('Critical');
        await expect(derivedSection.getByTestId('asset-derived-cif')).toHaveText('Yes');
    });

    test('Non-protected Process links add, swap primary, and remove without governed reasons', async ({
        riskManagerPage,
    }) => {
        const asset = await getAssetByName(E2E_ASSETS.INTEGRATION_BUS.name);
        const processA = await getProcessByL1(E2E_PROCESSES.POLICY_ADMIN.l1_process);
        const processB = await getProcessByL1(E2E_PROCESSES.PORTAL_SUPPORT.l1_process);
        expect(asset).not.toBeNull();
        expect(processA).not.toBeNull();
        expect(processB).not.toBeNull();
        // Deterministic baseline: this asset owns no links at test start.
        await resetAssetProcessLinks(asset!.id);

        await riskManagerPage.goto(`/assets/${asset!.id}`);
        await waitForDataLoad(riskManagerPage);

        // Both deterministic Processes derive CIF No: explicit confirmations
        // remain, while governed-request reason fields are intentionally absent.
        await riskManagerPage.getByTestId('asset-process-link-select').click();
        await riskManagerPage.getByRole('option', { name: /E2E-PROC-002/ }).click();
        await riskManagerPage.getByTestId('asset-process-link-significance').click();
        await riskManagerPage.getByRole('option', { name: 'BCM/DR vazba', exact: true }).click();
        await riskManagerPage.getByTestId('asset-process-link-add').click();
        const firstAddDialog = riskManagerPage.getByRole('alertdialog');
        await expect(
            firstAddDialog.getByRole('textbox', {
                name: /Request reason|Důvod žádosti/,
            }),
        ).toHaveCount(0);
        await firstAddDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();

        const processLinks = riskManagerPage.getByTestId('asset-process-links');
        await expect(processLinks.getByText(E2E_PROCESSES.POLICY_ADMIN.l1_process).first()).toBeVisible();
        await expect(processLinks.getByText('BCM/DR vazba').first()).toBeVisible();
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(0);

        await riskManagerPage.getByTestId('asset-process-link-select').click();
        await riskManagerPage.getByRole('option', { name: /E2E-PROC-004/ }).click();
        await riskManagerPage.getByTestId('asset-process-link-add').click();
        const secondAddDialog = riskManagerPage.getByRole('alertdialog');
        await expect(
            secondAddDialog.getByRole('textbox', {
                name: /Request reason|Důvod žádosti/,
            }),
        ).toHaveCount(0);
        await secondAddDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
        await expect(processLinks.getByText(E2E_PROCESSES.PORTAL_SUPPORT.l1_process).first()).toBeVisible();

        await riskManagerPage.getByTestId(`asset-process-link-set-primary-${processA!.id}`).click();
        const firstUpdateDialog = riskManagerPage.getByRole('alertdialog');
        await expect(
            firstUpdateDialog.getByRole('textbox', {
                name: /Request reason|Důvod žádosti/,
            }),
        ).toHaveCount(0);
        await firstUpdateDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${processA!.id}`)).toBeVisible();
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(1);

        await riskManagerPage.getByTestId(`asset-process-link-set-primary-${processB!.id}`).click();
        const secondUpdateDialog = riskManagerPage.getByRole('alertdialog');
        await expect(
            secondUpdateDialog.getByRole('textbox', {
                name: /Request reason|Důvod žádosti/,
            }),
        ).toHaveCount(0);
        await secondUpdateDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${processB!.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`asset-process-link-primary-${processA!.id}`)).toHaveCount(0);
        await expect(riskManagerPage.locator(PRIMARY_BADGE_SELECTOR)).toHaveCount(1);

        for (const processId of [processA!.id, processB!.id]) {
            await riskManagerPage.getByTestId(`asset-process-link-remove-${processId}`).click();
            const removeDialog = riskManagerPage.getByRole('alertdialog');
            await expect(
                removeDialog.getByRole('textbox', {
                    name: /Request reason|Důvod žádosti/,
                }),
            ).toHaveCount(0);
            await removeDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
            await expect(riskManagerPage.getByTestId(`asset-process-link-remove-${processId}`)).toHaveCount(0);
        }
        await expect(riskManagerPage.getByText(/No Processes linked yet|Zatím žádné vazby na procesy/)).toBeVisible();
    });

    test('Asset link management: add a directional dependency and remove it', async ({ riskManagerPage }) => {
        const asset = await getAssetByName(E2E_ASSETS.INTEGRATION_BUS.name);
        const supportingAsset = await getAssetByName(E2E_ASSETS.REPORTING_WAREHOUSE.name);
        expect(asset).not.toBeNull();
        expect(supportingAsset).not.toBeNull();
        const originalArchived = asset!.is_archived === true;
        const assetScenario = await getApprovalScenario('protected_asset_edit');
        let dependencyCreated = false;
        let primaryFailure: unknown;
        try {
            await updateApprovalScenario('protected_asset_edit', {
                ...assetScenario,
                requires_approval: false,
            });
            await ensureAssetArchived(E2E_ASSETS.INTEGRATION_BUS.name, false);
            await riskManagerPage.goto(`/assets/${asset!.id}`);
            await waitForDataLoad(riskManagerPage);

            await riskManagerPage.getByTestId('asset-asset-link-select').click();
            await riskManagerPage.getByRole('option', { name: /E2E-ASSET-004/ }).click();
            await riskManagerPage.getByTestId('asset-asset-link-dependency-type').click();
            await riskManagerPage.getByRole('option', { name: 'Datová', exact: true }).click();
            await riskManagerPage.getByTestId('asset-asset-link-add').click();
            const addDialog = riskManagerPage.getByRole('alertdialog');
            await addDialog.getByRole('textbox').fill('E2E direct asset dependency addition');
            const added = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && new URL(response.url()).pathname === `/api/v1/assets/${asset!.id}/asset-links`
            ));
            await addDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
            dependencyCreated = (await added).status() === 201;
            await expect(riskManagerPage).toHaveURL(new RegExp(`/assets/${asset!.id}$`));

            const assetLinks = riskManagerPage.getByTestId('asset-asset-links');
            const linkRow = assetLinks.locator('li').filter({
                hasText: E2E_ASSETS.REPORTING_WAREHOUSE.name,
            }).first();
            await expect(linkRow).toBeVisible();
            // Directional: this asset is the dependent side of the new link.
            await expect(linkRow.getByText(/Depends on|Závisí na/)).toBeVisible();
            await expect(linkRow.getByText('Datová', { exact: true })).toBeVisible();

            await linkRow.locator('[data-testid^="asset-asset-link-remove-"]').click();
            const removeDialog = riskManagerPage.getByRole('alertdialog');
            await removeDialog.getByRole('textbox').fill('E2E direct asset dependency removal');
            await removeDialog.getByRole('button', { name: 'Remove link', exact: true }).click();
            await expect(riskManagerPage).toHaveURL(new RegExp(`/assets/${asset!.id}$`));
            await expect(linkRow).toHaveCount(0);
            dependencyCreated = false;
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore Asset dependency fixture', [
                    ...(dependencyCreated ? [
                        () => removeAssetAssetLinkTuple(asset!.id, supportingAsset!.id),
                    ] : []),
                    () => ensureAssetArchived(E2E_ASSETS.INTEGRATION_BUS.name, originalArchived)
                        .then(() => undefined),
                    () => updateApprovalScenario('protected_asset_edit', assetScenario),
                ]),
                test.info(),
            );
        }
    });
});
