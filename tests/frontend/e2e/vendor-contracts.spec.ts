/**
 * ICT Register — Vendor Contracts + vendor register extension E2E
 * (issue #44, deterministic fixtures).
 *
 * Asserts CURRENT behavior: the Contracts section lives on the Vendor detail
 * behind the tab=contracts deep-link, entered 08_Smlouvy fields round-trip
 * through the inline dialog, closed lists come verbatim from the workbook
 * reference registry, TWO main contracts render side by side without error
 * (exactly-one-main is a DQ finding — ticket #50 — never a write constraint),
 * and the vendor form's register extension constrains substitutability to the
 * closed Substituce list. Contract maintenance follows vendor_contracts:write
 * (risk manager); the employee reads the section without manage affordances;
 * the platform admin has no vendor surface at all.
 */
import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures/auth.fixture';
import { E2E_ICT_VENDOR, E2E_VENDOR_CONTRACTS } from './fixtures/e2e-data';
import { getVendorByRegistration } from './helpers/api-auth';
import {
    type ApprovalScenarioSnapshot,
    createVendorContractViaApi,
    cancelPendingApprovalsForMarker,
    cleanupWithoutMaskingPrimaryFailure,
    ensureContractArchived,
    getApprovalScenario,
    getContractByReference,
    runCleanupSteps,
    updateVendorRegisterFields,
    updateVendorContractViaApi,
    updateApprovalScenario,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { VendorDetailPage } from './pages/VendorDetailPage';

// TypUjednani — verbatim workbook closed list (docs/dora-ict-register spec section 3.1).
const TYP_UJEDNANI = ['Samostatné', 'Rámcové (master)', 'Navazující'];
// MenaList — verbatim workbook closed list.
const MENA_LIST = ['CZK', 'EUR', 'USD', 'GBP'];
// TypKodu — verbatim workbook closed list (vendor register identifier type).
const TYP_KODU = ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN'];
// Locale-controlled labels for the Substituce closed list in the default English UI.
const SUBSTITUCE = [
    'Not substitutable',
    'Highly complex substitutability',
    'Medium complexity of substitutability',
    'Easily substitutable',
];

const MAIN_FLAG = /^(Main|Hlavní)$/;

interface RgbaColor {
    alpha: number;
    blue: number;
    green: number;
    red: number;
}

function parseComputedColor(value: string): RgbaColor {
    if (value === 'transparent') {
        return { red: 0, green: 0, blue: 0, alpha: 0 };
    }

    const rgb = value.match(
        /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*(?:,|\/)\s*([\d.]+%?))?\s*\)$/,
    );
    if (rgb) {
        const alpha = rgb[4]?.endsWith('%')
            ? Number.parseFloat(rgb[4]) / 100
            : Number.parseFloat(rgb[4] ?? '1');
        return {
            red: Number.parseFloat(rgb[1]),
            green: Number.parseFloat(rgb[2]),
            blue: Number.parseFloat(rgb[3]),
            alpha,
        };
    }

    const srgb = value.match(
        /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/,
    );
    if (srgb) {
        const alpha = srgb[4]?.endsWith('%')
            ? Number.parseFloat(srgb[4]) / 100
            : Number.parseFloat(srgb[4] ?? '1');
        return {
            red: Number.parseFloat(srgb[1]) * 255,
            green: Number.parseFloat(srgb[2]) * 255,
            blue: Number.parseFloat(srgb[3]) * 255,
            alpha,
        };
    }

    throw new Error(`Unsupported computed color: ${value}`);
}

function compositeColor(foreground: RgbaColor, background: RgbaColor): RgbaColor {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
    if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };

    const compositeChannel = (foregroundChannel: number, backgroundChannel: number) => (
        (foregroundChannel * foreground.alpha
            + backgroundChannel * background.alpha * (1 - foreground.alpha)) / alpha
    );
    return {
        red: compositeChannel(foreground.red, background.red),
        green: compositeChannel(foreground.green, background.green),
        blue: compositeChannel(foreground.blue, background.blue),
        alpha,
    };
}

function relativeLuminance(color: RgbaColor): number {
    const linear = [color.red, color.green, color.blue].map((channel) => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function renderedContrastRatio(foregroundValue: string, backgroundValues: string[]): number {
    let background = { red: 255, green: 255, blue: 255, alpha: 1 };
    for (const value of backgroundValues) {
        background = compositeColor(parseComputedColor(value), background);
    }
    const foreground = compositeColor(parseComputedColor(foregroundValue), background);
    const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
    const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

async function seededVendorId(): Promise<number> {
    const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
    if (!vendor) {
        throw new Error(`Vendor '${E2E_ICT_VENDOR.registration_id}' not found — run the deterministic E2E seed first.`);
    }
    return vendor.id;
}

test.describe('ICT Register — Vendor Contracts (Deterministic)', () => {

    let originalProtectedVendorScenario: ApprovalScenarioSnapshot | null = null;
    let originalVendorRegisterFields: {
        identifier_type: string | null;
        identifier_value: string | null;
        replaceability: string | null;
    } | null = null;

    test.beforeAll(async () => {
        const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
        if (!vendor) {
            throw new Error(`Vendor '${E2E_ICT_VENDOR.registration_id}' not found — run the deterministic E2E seed first.`);
        }
        originalVendorRegisterFields = {
            identifier_type: vendor.identifier_type ?? null,
            identifier_value: vendor.identifier_value ?? null,
            replaceability: vendor.replaceability ?? null,
        };
        originalProtectedVendorScenario = await getApprovalScenario('protected_vendor_edit');
        await updateApprovalScenario('protected_vendor_edit', {
            ...originalProtectedVendorScenario,
            requires_approval: false,
        });
    });

    test.afterAll(async () => {
        const vendorId = await seededVendorId();
        await runCleanupSteps('Failed to restore Vendor contract suite fixtures', [
            ...(originalVendorRegisterFields === null
                ? []
                : [() => updateVendorRegisterFields(vendorId, originalVendorRegisterFields!)]),
            ...(originalProtectedVendorScenario === null
                ? []
                : [() => updateApprovalScenario('protected_vendor_edit', originalProtectedVendorScenario!)]),
        ]);
    });
    test('Deep-link tab=contracts lands on the Contracts section of the seeded vendor', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'contracts');

        // tab=contracts resolves to a scroll target, so the URL is NOT
        // normalized away (unknown tabs like ?tab=sla are stripped). The
        // scroll itself is best-effort — later-loading sections reflow the
        // page — so the stable contract is URL retention + the anchored
        // section rendering.
        await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}\\?tab=contracts$`));
        await expect(riskManagerPage.locator('main h1').first()).toContainText(E2E_ICT_VENDOR.name);
        await expect(detailPage.contractsSection).toBeVisible();
        await expect(
            detailPage.contractsSection.getByText(/Contracts|Smlouvy/).first(),
        ).toBeVisible();
    });

    test('Seeded contracts render with Main/RoI flags and the archived row keeps its restore affordance', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const archivedId = await ensureContractArchived(
            vendorId,
            E2E_VENDOR_CONTRACTS.ARCHIVED.contract_reference,
            true,
        );

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'contracts');

        // Active seeded rows render with their workbook-coded columns verbatim.
        const mainRow = detailPage.contractRowByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference);
        await expect(mainRow).toBeVisible();
        await expect(mainRow.getByText('Rámcové (master)', { exact: true })).toBeVisible();
        await expect(mainRow.getByText(MAIN_FLAG)).toBeVisible();
        await expect(mainRow.getByText('RoI', { exact: true })).toBeVisible();

        const secondRow = detailPage.contractRowByText(E2E_VENDOR_CONTRACTS.SECOND_MAIN.contract_reference);
        await expect(secondRow).toBeVisible();
        await expect(secondRow.getByText('Samostatné', { exact: true })).toBeVisible();

        // The section always fetches include_archived: the archived seeded row
        // stays visible inline, carrying restore as its only row action.
        const archivedRow = detailPage.contractRowByText(E2E_VENDOR_CONTRACTS.ARCHIVED.contract_reference);
        await expect(archivedRow).toBeVisible();
        await expect(archivedRow.getByTestId(`vendor-contract-restore-${archivedId}`)).toBeVisible();
        await expect(archivedRow.getByTestId(`vendor-contract-edit-${archivedId}`)).toHaveCount(0);
        await expect(archivedRow.getByTestId(`vendor-contract-archive-${archivedId}`)).toHaveCount(0);
    });

    test('TWO main contracts render side by side without error (no uniqueness constraint)', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'contracts');

        // Both seeded mains carry the Main badge — the workbook's
        // exactly-one-main rule is a DQ finding (#50), not a write block.
        const firstMain = detailPage.contractRowByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference);
        const secondMain = detailPage.contractRowByText(E2E_VENDOR_CONTRACTS.SECOND_MAIN.contract_reference);
        await expect(firstMain.getByText(MAIN_FLAG)).toBeVisible();
        await expect(secondMain.getByText(MAIN_FLAG)).toBeVisible();
        // No section error banner accompanies the duplicate-main render.
        await expect(
            detailPage.contractsSection.getByText(/Saving the contract failed|Uložení smlouvy se nezdařilo/),
        ).toHaveCount(0);
    });

    test('Create flow offers verbatim workbook closed lists and the new contract lands in the table', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const uniqueReference = `E2E-CTR-UI ${Date.now()}`;

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'contracts');

        await riskManagerPage.getByTestId('vendor-contract-add').click();
        await expect(riskManagerPage.getByTestId('vendor-contract-form')).toBeVisible();

        // Arrangement type dropdown carries the TypUjednani workbook list verbatim.
        await riskManagerPage.getByTestId('vendor-contract-field-arrangement_type').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(TYP_UJEDNANI.length + 1); // + "Not set"
        for (const value of TYP_UJEDNANI) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: 'Samostatné', exact: true }).click();

        // Currency dropdown carries the MenaList workbook list verbatim.
        await riskManagerPage.getByTestId('vendor-contract-field-currency').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(MENA_LIST.length + 1);
        for (const value of MENA_LIST) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: 'EUR', exact: true }).click();

        await riskManagerPage.getByTestId('vendor-contract-field-contract_reference').fill(uniqueReference);
        await riskManagerPage.getByTestId('vendor-contract-field-start_date').fill('2026-01-01');
        await riskManagerPage.getByTestId('vendor-contract-field-annual_cost').fill('12000');
        await riskManagerPage.getByTestId('vendor-contract-form-save').click();

        // The form closes and the refreshed table carries the new row.
        await expect(riskManagerPage.getByTestId('vendor-contract-form')).toHaveCount(0);
        const createdRow = detailPage.contractRowByText(uniqueReference);
        await expect(createdRow).toBeVisible();
        await expect(createdRow.getByText('Samostatné', { exact: true })).toBeVisible();

        const created = await getContractByReference(vendorId, uniqueReference);
        expect(created).not.toBeNull();
        expect(created!.is_archived).toBe(false);
    });

    test('Edit round-trip persists contract changes', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const uniqueReference = `E2E-CTR-EDIT ${Date.now()}`;
        const created = await createVendorContractViaApi(vendorId, {
            contract_reference: uniqueReference,
            arrangement_type: 'Samostatné',
            internal_contract_number: 'TAS-ORIGINAL',
        });

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'contracts');

        await riskManagerPage.getByTestId(`vendor-contract-edit-${created.id}`).click();
        const form = riskManagerPage.getByTestId('vendor-contract-form');
        await expect(form).toBeVisible();
        await expect(riskManagerPage.getByTestId('vendor-contract-field-contract_reference')).toHaveValue(uniqueReference);

        await riskManagerPage.getByTestId('vendor-contract-field-internal_contract_number').fill('TAS-EDITED-42');
        await riskManagerPage.getByTestId('vendor-contract-field-arrangement_type').click();
        await riskManagerPage.getByRole('option', { name: 'Navazující', exact: true }).click();
        await riskManagerPage.getByTestId('vendor-contract-form-save').click();
        await expect(form).toHaveCount(0);

        // Hard reload: a fresh document proves persistence beyond the query cache.
        await detailPage.navigateToSection(vendorId, 'contracts');
        const editedRow = detailPage.contractRowByText(uniqueReference);
        await expect(editedRow).toBeVisible();
        await expect(editedRow.getByText('TAS-EDITED-42', { exact: true })).toBeVisible();
        await expect(editedRow.getByText('Navazující', { exact: true })).toBeVisible();
    });

    test('protected Vendor contract edit and archive preserve approved truth until independent approval', async ({
        riskManagerPage,
        croPage,
    }) => {
        const vendorId = await seededVendorId();
        const contractReference = E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference;
        const contract = await getContractByReference(vendorId, contractReference);
        expect(contract).not.toBeNull();
        const originalNote = contract!.note;
        const originalArchived = contract!.is_archived;
        const scenario = await getApprovalScenario('protected_vendor_edit');
        const proposedNote = `Governed contract note ${Date.now()}`;
        const reason = `Approve protected Vendor contract ${Date.now()}`;
        const archiveReason = `Archive protected Vendor contract ${Date.now()}`;
        let primaryFailure: unknown;

        try {
            await ensureContractArchived(vendorId, contractReference, false);
            await updateApprovalScenario('protected_vendor_edit', {
                ...scenario,
                requires_approval: true,
            });

            await riskManagerPage.addInitScript(() => {
                localStorage.setItem('riskhub-theme', 'light');
                localStorage.setItem('riskhub-language', 'en');
            });
            await riskManagerPage.route('**/api/v1/preferences', async (route, request) => {
                if (request.method() === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ theme: 'light', language: 'en' }),
                    });
                    return;
                }
                await route.continue();
            });

            const detailPage = new VendorDetailPage(riskManagerPage);
            await detailPage.navigateToSection(vendorId, 'contracts');
            await expect(riskManagerPage.locator('html')).toHaveClass(/theme-light/);
            await riskManagerPage.getByTestId(`vendor-contract-edit-${contract!.id}`).click();
            await riskManagerPage.getByTestId('vendor-contract-field-note').fill(proposedNote);
            await riskManagerPage.getByTestId('vendor-contract-form-save').click();
            const requestReason = riskManagerPage.getByTestId('vendor-contract-request-reason');
            await expect(requestReason).toHaveAttribute('id', 'vendor-contract-request-reason');
            await expect(requestReason).toBeFocused();
            await expect(requestReason).toHaveAttribute('aria-invalid', 'true');
            const requestReasonAlert = riskManagerPage.getByRole('alert');
            await expect(requestReasonAlert).toContainText(
                /A request reason is required|Je vyžadován důvod žádosti/,
            );
            await requestReasonAlert.scrollIntoViewIfNeeded();
            await expect(requestReasonAlert).toBeVisible();
            const contrast = await new AxeBuilder({ page: riskManagerPage })
                .include('[role="alert"]')
                .withRules(['color-contrast'])
                .analyze();
            const axeColorContrastResults = [
                ...contrast.violations,
                ...contrast.incomplete,
                ...contrast.passes,
            ].filter((result) => result.id === 'color-contrast');
            expect(axeColorContrastResults.length).toBeGreaterThan(0);
            expect(
                contrast.violations.map((violation) => violation.id),
                contrast.violations
                    .flatMap((violation) => violation.nodes.map((node) => (
                        `[${violation.id}] ${JSON.stringify(node.target)} ${node.failureSummary ?? ''}`
                    )))
                    .join('\n'),
            ).toEqual([]);
            const renderedColors = await requestReasonAlert.evaluate((element) => {
                const backgrounds: string[] = [];
                let current: Element | null = element;
                while (current) {
                    backgrounds.unshift(getComputedStyle(current).backgroundColor);
                    current = current.parentElement;
                }
                return {
                    backgrounds,
                    foreground: getComputedStyle(element).color,
                };
            });
            const ratio = renderedContrastRatio(
                renderedColors.foreground,
                renderedColors.backgrounds,
            );
            expect(
                ratio,
                `Rendered blank-reason alert color-contrast ratio was ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(4.5);
            await requestReason.fill(reason);

            const queued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'PATCH'
                && new URL(response.url()).pathname
                    === `/api/v1/vendors/${vendorId}/contracts/${contract!.id}`
            ));
            await riskManagerPage.getByTestId('vendor-contract-form-save').click();
            expect((await queued).status()).toBe(202);
            await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);

            expect((await getContractByReference(vendorId, contractReference))!.note).toBe(originalNote);
            await detailPage.navigateToSection(vendorId, 'contracts');
            await riskManagerPage.getByTestId(`vendor-contract-edit-${contract!.id}`).click();
            await expect(riskManagerPage.getByTestId('vendor-contract-field-note'))
                .toHaveValue(originalNote ?? '');

            const approvals = new ApprovalsPage(croPage);
            await approvals.navigate();
            const approvalIndex = await approvals.findCardByReason(reason);
            await approvals.clickApprove(approvalIndex);
            const approved = croPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && /\/api\/v1\/approvals\/\d+\/approve$/.test(new URL(response.url()).pathname)
            ));
            await approvals.submitResolution(`Approve ${reason}`, 'approve');
            expect((await approved).status()).toBe(200);

            await expect.poll(
                async () => (await getContractByReference(vendorId, contractReference))!.note,
            ).toBe(proposedNote);
            await detailPage.navigateToSection(vendorId, 'contracts');
            await riskManagerPage.getByTestId(`vendor-contract-edit-${contract!.id}`).click();
            await expect(riskManagerPage.getByTestId('vendor-contract-field-note')).toHaveValue(proposedNote);
            await riskManagerPage.getByTestId('vendor-contract-form-cancel').click();

            await riskManagerPage.getByTestId(`vendor-contract-archive-${contract!.id}`).click();
            const archiveDialog = riskManagerPage.getByRole('alertdialog');
            await archiveDialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ })
                .fill(archiveReason);
            const archiveQueued = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'DELETE'
                && new URL(response.url()).pathname
                    === `/api/v1/vendors/${vendorId}/contracts/${contract!.id}`
            ));
            await archiveDialog.getByRole('button', { name: /Archive contract|Archivovat smlouvu/ }).click();
            expect((await archiveQueued).status()).toBe(202);
            await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+/);
            expect((await getContractByReference(vendorId, contractReference))!.is_archived).toBe(false);

            await approvals.navigate();
            const archiveApprovalIndex = await approvals.findCardByReason(archiveReason);
            await approvals.clickApprove(archiveApprovalIndex);
            const archiveApproved = croPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && /\/api\/v1\/approvals\/\d+\/approve$/.test(new URL(response.url()).pathname)
            ));
            await approvals.submitResolution(`Approve ${archiveReason}`, 'approve');
            expect((await archiveApproved).status()).toBe(200);
            await expect.poll(
                async () => (await getContractByReference(vendorId, contractReference))!.is_archived,
            ).toBe(true);

            await detailPage.navigateToSection(vendorId, 'contracts');
            const restored = riskManagerPage.waitForResponse((response) => (
                response.request().method() === 'POST'
                && new URL(response.url()).pathname
                    === `/api/v1/vendors/${vendorId}/contracts/${contract!.id}/restore`
            ));
            await riskManagerPage.getByTestId(`vendor-contract-restore-${contract!.id}`).click();
            expect((await restored).status()).toBe(200);
            await expect.poll(
                async () => (await getContractByReference(vendorId, contractReference))!.is_archived,
            ).toBe(false);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => runCleanupSteps('Failed to restore governed Vendor contract fixture', [
                    () => cancelPendingApprovalsForMarker(reason),
                    () => cancelPendingApprovalsForMarker(archiveReason),
                    () => updateApprovalScenario('protected_vendor_edit', {
                        ...scenario,
                        requires_approval: false,
                    }),
                    () => ensureContractArchived(vendorId, contractReference, false).then(() => undefined),
                    () => updateVendorContractViaApi(vendorId, contract!.id, { note: originalNote }).then(() => undefined),
                    () => ensureContractArchived(vendorId, contractReference, originalArchived).then(() => undefined),
                    () => updateApprovalScenario('protected_vendor_edit', scenario),
                ]),
                test.info(),
            );
        }
    });

    test('Archive and restore round-trip through the section row actions', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const uniqueReference = `E2E-CTR-LC ${Date.now()}`;
        const created = await createVendorContractViaApi(vendorId, {
            contract_reference: uniqueReference,
        });

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'contracts');
        const row = detailPage.contractRowByText(uniqueReference);
        await expect(row).toBeVisible();

        // Archive: the row swaps its actions to restore-only.
        await riskManagerPage.getByTestId(`vendor-contract-archive-${created.id}`).click();
        await expect(riskManagerPage.getByTestId(`vendor-contract-restore-${created.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`vendor-contract-archive-${created.id}`)).toHaveCount(0);
        await expect(riskManagerPage.getByTestId(`vendor-contract-edit-${created.id}`)).toHaveCount(0);

        // Restore: edit and archive come back, restore disappears.
        await riskManagerPage.getByTestId(`vendor-contract-restore-${created.id}`).click();
        await expect(riskManagerPage.getByTestId(`vendor-contract-archive-${created.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`vendor-contract-edit-${created.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`vendor-contract-restore-${created.id}`)).toHaveCount(0);
    });

    test('Employee sees the Contracts section read-only: no manage affordances', async ({ employeePage }) => {
        const vendorId = await seededVendorId();

        const detailPage = new VendorDetailPage(employeePage);
        await detailPage.navigateToSection(vendorId, 'contracts');

        // vendor_contracts:read renders the section with the seeded rows...
        await expect(detailPage.contractsSection).toBeVisible();
        await expect(
            detailPage.contractRowByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference),
        ).toBeVisible();
        // ...but without vendor_contracts:write there is no add, edit, archive, or restore.
        await expect(employeePage.getByTestId('vendor-contract-add')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="vendor-contract-edit-"]')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="vendor-contract-archive-"]')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="vendor-contract-restore-"]')).toHaveCount(0);
    });

    test('Platform admin gets no vendor surface: no navigation and no vendor detail', async ({ adminPage }) => {
        const vendorId = await seededVendorId();

        // Anchor on the admin-only console link before asserting the absence.
        await expect(adminPage.locator('a[href="/admin"]').first()).toBeVisible();
        await expect(adminPage.locator('nav a[href="/vendors"]')).toHaveCount(0);

        // A direct visit uses deliberate not-found camouflage, never the vendor page.
        await adminPage.goto(`/vendors/${vendorId}?tab=contracts`);
        await waitForDataLoad(adminPage);
        await expect(adminPage.getByRole('heading', { name: /Vendor not found|Dodavatel nenalezen/i })).toBeVisible();
        await expect(adminPage.locator('#vendor-contracts')).toHaveCount(0);
    });

    test('Vendor register extension: identifier type/value and Substituce-constrained substitutability round-trip', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();

        await riskManagerPage.goto(`/vendors/${vendorId}/edit`);
        await waitForDataLoad(riskManagerPage);

        // Identifier type dropdown carries the TypKodu workbook list verbatim.
        await riskManagerPage.getByTestId('vendor-register-identifier_type').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(TYP_KODU.length + 1); // + "Not set"
        for (const value of TYP_KODU) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: 'EUID', exact: true }).click();
        await riskManagerPage.getByTestId('vendor-register-identifier_value').fill('E2E-EUID-0001');

        // Substitutability offers EXACTLY the four Substituce values (+ the
        // empty choice) — the seeded value is already on the closed list, so
        // no legacy easy/medium/hard entry is prepended.
        const substitutabilityField = riskManagerPage
            .locator('.vendor-field')
            .filter({ hasText: /^(Replaceability|Nahraditelnost)/ })
            .first();
        await substitutabilityField.getByRole('combobox').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(SUBSTITUCE.length + 1);
        for (const value of SUBSTITUCE) {
            await expect(riskManagerPage.getByRole('option', { name: value, exact: true })).toBeVisible();
        }
        await riskManagerPage.getByRole('option', { name: 'Easily substitutable', exact: true }).click();

        await riskManagerPage.getByRole('button', { name: /^(Save|Uložit)$/ }).click();
        await riskManagerPage.waitForURL(new RegExp(`/vendors/${vendorId}$`));

        // Hard reload: the detail overview renders the persisted Substituce value...
        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByText('Easily substitutable', { exact: true }).first()).toBeVisible();

        // ...and a fresh edit form carries all three persisted register fields.
        await riskManagerPage.goto(`/vendors/${vendorId}/edit`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('vendor-register-identifier_type')).toContainText('EUID');
        await expect(riskManagerPage.getByTestId('vendor-register-identifier_value')).toHaveValue('E2E-EUID-0001');
        await expect(substitutabilityField.getByRole('combobox')).toContainText('Easily substitutable');

    });
});
