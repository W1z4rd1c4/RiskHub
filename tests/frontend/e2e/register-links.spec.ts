/**
 * ICT Register — Link relations E2E (issue #46, deterministic fixtures).
 *
 * Asserts CURRENT behavior across the three link surfaces: the Asset detail's
 * Vendors subsection (sheet 10_VAD, typed by the S01-S19 taxonomy — the
 * identity tuple is asset + vendor + S-code), the Process detail's Vendor
 * links section (sheet 11 §1, unique pair with a direct-service description),
 * and the Vendor detail's Register-links section (both far-end blocks,
 * delete-only rows gated per-row by the backend can_delete capability).
 * Mutations always call the register-end routes; the employee reads every
 * surface without manage affordances.
 *
 * Determinism: the SEEDED links live on E2E-VENDOR-ICT and feed the derived
 * values pinned by vendor-derived.spec.ts, so every mutation flow here works
 * on the non-protected E2E-VENDOR-006 + E2E-ASSET-003 / E2E-PROC-004
 * instead, each test on its own (asset, vendor, S-code) tuple.
 */
import { test, expect } from './fixtures/auth.fixture';
import {
    E2E_ASSETS,
    E2E_ASSET_VENDOR_LINKS,
    E2E_ICT_VENDOR,
    E2E_PROCESSES,
    E2E_PROCESS_VENDOR_LINKS,
    E2E_VENDORS,
} from './fixtures/e2e-data';
import { getVendorByRegistration } from './helpers/api-auth';
import {
    createAssetVendorLinkViaApi,
    cleanupWithoutMaskingPrimaryFailure,
    getApprovalScenario,
    getAssetByName,
    getProcessByL1,
    listAssetVendorLinks,
    listProcessVendorLinks,
    removeAssetVendorLinkTuple,
    removeProcessVendorLinkPair,
    runCleanupSteps,
    updateApprovalScenario,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';

// S01-S19 ICT service taxonomy, verbatim workbook labels (spec section 3.2);
// the asset-end S-code dropdown renders each option as "<code> — <label>"
// with NO empty entry (the S-code is part of the link identity).
const ICT_SERVICE_OPTIONS = [
    'S01 — Řízení projektů v oblasti IKT',
    'S02 — Rozvoj IKT',
    'S03 — Asistenční služby a podpora první úrovně',
    'S04 — Služby řízení bezpečnosti v oblasti IKT',
    'S05 — Poskytování údajů',
    'S06 — Analýza údajů',
    'S07 — IKT, zařízení a hostingové služby',
    'S08 — Počítačové zpracování',
    'S09 — Úložiště dat mimo cloud',
    'S10 — Poskytovatel telekomunikačních služeb',
    'S11 — Síťová infrastruktura',
    'S12 — Hardware a fyzická zařízení',
    'S13 — Licencování softwaru',
    'S14 — Řízení provozu IKT',
    'S15 — Poradenství v oblasti IKT',
    'S16 — Řízení rizika v oblasti IKT',
    'S17 — Cloudové služby: IaaS',
    'S18 — Cloudové služby: PaaS',
    'S19 — Cloudové služby: SaaS',
];

async function requireVendorId(registrationId: string): Promise<number> {
    const vendor = await getVendorByRegistration(registrationId);
    if (!vendor) {
        throw new Error(`Vendor '${registrationId}' not found — run the deterministic E2E seed first.`);
    }
    return vendor.id;
}

async function requireAssetId(name: string): Promise<number> {
    const asset = await getAssetByName(name);
    if (!asset) {
        throw new Error(`Asset '${name}' not found — run the deterministic E2E seed first.`);
    }
    return asset.id;
}

async function requireProcessId(l1Process: string): Promise<number> {
    const process = await getProcessByL1(l1Process);
    if (!process) {
        throw new Error(`Process '${l1Process}' not found — run the deterministic E2E seed first.`);
    }
    return process.id;
}

async function withDirectAssetVendorMechanics(run: () => Promise<void>): Promise<void> {
    const assetScenario = await getApprovalScenario('protected_asset_edit');
    const vendorScenario = await getApprovalScenario('protected_vendor_edit');
    let primaryFailure: unknown;
    try {
        await updateApprovalScenario('protected_asset_edit', {
            ...assetScenario,
            requires_approval: false,
        });
        await updateApprovalScenario('protected_vendor_edit', {
            ...vendorScenario,
            requires_approval: false,
        });
        await run();
    } catch (error) {
        primaryFailure = error;
        throw error;
    } finally {
        await cleanupWithoutMaskingPrimaryFailure(
            primaryFailure,
            () => runCleanupSteps('Failed to restore Asset/Vendor approval policies', [
                () => updateApprovalScenario('protected_vendor_edit', vendorScenario),
                () => updateApprovalScenario('protected_asset_edit', assetScenario),
            ]),
            test.info(),
        );
    }
}

test.describe('ICT Register — Link relations (Deterministic)', () => {
    test('Asset detail renders the seeded Vendors subsection with S-code metadata', async ({ riskManagerPage }) => {
        const assetId = await requireAssetId(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);

        await riskManagerPage.goto(`/assets/${assetId}`);
        await waitForDataLoad(riskManagerPage);

        // The seeded S17 link renders the vendor name and every entered
        // column in the meta line: role · S-code · contract ref · reliance.
        const vendorLinks = riskManagerPage.getByTestId('asset-vendor-links');
        await expect(vendorLinks).toBeVisible();
        await expect(vendorLinks.getByText(E2E_ICT_VENDOR.name).first()).toBeVisible();
        const seeded = E2E_ASSET_VENDOR_LINKS.CLAIMS_SYSTEM_S17;
        await expect(
            vendorLinks.getByText(
                `${seeded.vendor_role} · ${seeded.ict_service_code} · ${seeded.contract_reference} · ${seeded.reliance}`,
                { exact: true },
            ),
        ).toBeVisible();
    });

    test('Asset-end add and remove with the verbatim 19-code S-code taxonomy', async ({ riskManagerPage }) => {
        const assetId = await requireAssetId(E2E_ASSETS.INTEGRATION_BUS.name);
        const vendorId = await requireVendorId(E2E_VENDORS.NONPROTECTED_DIRECT.registration_id);
        await withDirectAssetVendorMechanics(async () => {
            // Idempotent baseline: only THIS tuple is cleared, so parallel tests
            // on the same rows never lose their in-flight fixtures.
            await removeAssetVendorLinkTuple(assetId, vendorId, 'S03');

            try {
                await riskManagerPage.goto(`/assets/${assetId}`);
                await waitForDataLoad(riskManagerPage);

                await riskManagerPage.getByTestId('asset-vendor-link-select').click();
                await riskManagerPage
                    .getByRole('option', {
                        name: E2E_VENDORS.NONPROTECTED_DIRECT.name,
                        exact: true,
                    })
                    .click();

                // The S-code dropdown carries the S01-S19 taxonomy verbatim, in
                // order, with no empty entry (the S-code is part of the identity).
                await riskManagerPage.getByTestId('asset-vendor-link-s-code').click();
                await expect(riskManagerPage.getByRole('option')).toHaveCount(ICT_SERVICE_OPTIONS.length);
                const optionTexts = await riskManagerPage.getByRole('option').allTextContents();
                expect(optionTexts).toEqual(ICT_SERVICE_OPTIONS);
                await riskManagerPage.getByRole('option', { name: ICT_SERVICE_OPTIONS[2], exact: true }).click();

                await riskManagerPage.getByTestId('asset-vendor-link-add').click();
                const addDialog = riskManagerPage.getByRole('alertdialog');
                await addDialog.getByRole('textbox').fill('E2E direct Asset-Vendor link addition');
                await addDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
                await expect(riskManagerPage).toHaveURL(new RegExp(`/assets/${assetId}(?:\\?.*)?$`));

                const vendorLinks = riskManagerPage.getByTestId('asset-vendor-links');
                await expect(vendorLinks.getByText(E2E_VENDORS.NONPROTECTED_DIRECT.name).first()).toBeVisible();
                await expect(vendorLinks.getByText('S03', { exact: true })).toBeVisible();

                // Remove from the same asset end; the row disappears and the API
                // confirms the tuple is gone.
                const created = (await listAssetVendorLinks(assetId)).find(
                    (link) => link.vendor_id === vendorId && link.ict_service_code === 'S03',
                );
                expect(created).toBeDefined();
                await riskManagerPage.getByTestId(`asset-vendor-link-remove-${created!.id}`).click();
                const removeDialog = riskManagerPage.getByRole('alertdialog');
                await removeDialog.getByRole('textbox').fill('E2E direct Asset-Vendor link removal');
                await removeDialog.getByRole('button', { name: 'Remove link', exact: true }).click();
                await expect(riskManagerPage).toHaveURL(new RegExp(`/assets/${assetId}(?:\\?.*)?$`));
                await expect(riskManagerPage.getByTestId(`asset-vendor-link-remove-${created!.id}`)).toHaveCount(0);
                const remaining = await listAssetVendorLinks(assetId);
                expect(remaining.some((link) => link.vendor_id === vendorId && link.ict_service_code === 'S03')).toBe(
                    false,
                );
            } finally {
                await removeAssetVendorLinkTuple(assetId, vendorId, 'S03');
            }
        });
    });

    test('Process-end add and remove of the §1 vendor pair', async ({ riskManagerPage }) => {
        const processId = await requireProcessId(E2E_PROCESSES.PORTAL_SUPPORT.l1_process);
        const vendorId = await requireVendorId(E2E_VENDORS.NONPROTECTED_DIRECT.registration_id);
        await removeProcessVendorLinkPair(processId, vendorId);
        let primaryFailure: unknown;

        try {
            await riskManagerPage.goto(`/processes/${processId}`);
            await waitForDataLoad(riskManagerPage);
            await expect(riskManagerPage.getByTestId('process-vendor-links-section')).toBeVisible();

            await riskManagerPage.getByTestId('process-vendor-link-select').click();
            await riskManagerPage
                .getByRole('option', {
                    name: E2E_VENDORS.NONPROTECTED_DIRECT.name,
                    exact: true,
                })
                .click();
            await riskManagerPage.getByTestId('process-vendor-link-description').fill('E2E direct service (§1)');
            await riskManagerPage.getByTestId('process-vendor-link-add').click();
            const addDialog = riskManagerPage.getByRole('alertdialog');
            // PORTAL_SUPPORT derives CIF No. The deterministic confirmation stays
            // visible, but it must not invent a governed-request reason field.
            await expect(addDialog.getByRole('textbox', { name: /Request reason|Důvod žádosti/ })).toHaveCount(0);
            await addDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();

            const processLinks = riskManagerPage.getByTestId('process-vendor-links');
            await expect(processLinks.getByText(E2E_VENDORS.NONPROTECTED_DIRECT.name).first()).toBeVisible();
            await expect(processLinks.getByText('E2E direct service (§1)', { exact: true })).toBeVisible();

            // §1 pairs are unique: the linked vendor leaves the add dropdown.
            await riskManagerPage.getByTestId('process-vendor-link-select').click();
            await expect(
                riskManagerPage.getByRole('option', {
                    name: E2E_VENDORS.NONPROTECTED_DIRECT.name,
                    exact: true,
                }),
            ).toHaveCount(0);
            await riskManagerPage.keyboard.press('Escape');

            const created = (await listProcessVendorLinks(processId)).find((link) => link.vendor_id === vendorId);
            expect(created).toBeDefined();
            await riskManagerPage.getByTestId(`process-vendor-link-remove-${created!.id}`).click();
            const removeDialog = riskManagerPage.getByRole('alertdialog');
            await expect(
                removeDialog.getByRole('textbox', {
                    name: /Request reason|Důvod žádosti/,
                }),
            ).toHaveCount(0);
            await removeDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
            await expect(riskManagerPage.getByTestId(`process-vendor-link-remove-${created!.id}`)).toHaveCount(0);
            const remaining = await listProcessVendorLinks(processId);
            expect(remaining.some((link) => link.vendor_id === vendorId)).toBe(false);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => removeProcessVendorLinkPair(processId, vendorId),
                test.info(),
            );
        }
    });

    test('Vendor detail Register-links section renders both far-end blocks with delete affordances', async ({
        riskManagerPage,
    }) => {
        const vendorId = await requireVendorId(E2E_ICT_VENDOR.registration_id);

        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);

        const section = riskManagerPage.getByTestId('vendor-register-links-section');
        await expect(section).toBeVisible();

        // Linked-Assets block: both seeded 10_VAD links with their S-codes.
        const assetLinks = riskManagerPage.getByTestId('vendor-asset-links');
        await expect(assetLinks.getByText(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name).first()).toBeVisible();
        await expect(assetLinks.getByText(E2E_ASSETS.CLAIMS_DATABASE.name).first()).toBeVisible();
        await expect(
            assetLinks.getByText(new RegExp(E2E_ASSET_VENDOR_LINKS.CLAIMS_SYSTEM_S17.ict_service_code)).first(),
        ).toBeVisible();

        // Linked-Processes block: the seeded §1 pair with its description.
        const processLinks = riskManagerPage.getByTestId('vendor-process-links');
        await expect(
            processLinks.getByText(new RegExp(E2E_PROCESS_VENDOR_LINKS.REGULATORY_REPORTING.process_l1)).first(),
        ).toBeVisible();
        await expect(
            processLinks
                .getByText(E2E_PROCESS_VENDOR_LINKS.REGULATORY_REPORTING.direct_service_description, { exact: true })
                .first(),
        ).toBeVisible();

        // Rows are delete-only (no edit), gated per row by can_delete —
        // the risk manager holds the register-end write on both ends.
        await expect(riskManagerPage.locator('[data-testid^="vendor-asset-link-remove-"]')).toHaveCount(2);
        await expect(riskManagerPage.locator('[data-testid^="vendor-process-link-remove-"]')).toHaveCount(1);
    });

    test('Vendor-end delete removes the link when can_delete grants it', async ({ riskManagerPage }) => {
        const vendorId = await requireVendorId(E2E_VENDORS.NONPROTECTED_DIRECT.registration_id);
        const assetId = await requireAssetId(E2E_ASSETS.INTEGRATION_BUS.name);
        await withDirectAssetVendorMechanics(async () => {
            // Own tuple (S13) so the asset-end test's S03 flow never collides.
            await removeAssetVendorLinkTuple(assetId, vendorId, 'S13');
            try {
                const created = await createAssetVendorLinkViaApi(assetId, {
                    vendor_id: vendorId,
                    ict_service_code: 'S13',
                });

                await riskManagerPage.goto(`/vendors/${vendorId}`);
                await waitForDataLoad(riskManagerPage);

                const assetLinks = riskManagerPage.getByTestId('vendor-asset-links');
                await expect(assetLinks.getByText(E2E_ASSETS.INTEGRATION_BUS.name).first()).toBeVisible();

                // The vendor-end remove calls the register-end DELETE route.
                await riskManagerPage.getByTestId(`vendor-asset-link-remove-${created.id}`).click();
                const removeDialog = riskManagerPage.getByRole('alertdialog');
                await removeDialog.getByRole('textbox').fill('E2E direct Vendor-Asset link removal');
                await removeDialog.getByRole('button', { name: /Continue|Pokračovat/ }).click();
                await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}(?:\\?.*)?$`));
                await expect(riskManagerPage.getByTestId(`vendor-asset-link-remove-${created.id}`)).toHaveCount(0);
                const remaining = await listAssetVendorLinks(assetId);
                expect(remaining.some((link) => link.vendor_id === vendorId && link.ict_service_code === 'S13')).toBe(
                    false,
                );
            } finally {
                await removeAssetVendorLinkTuple(assetId, vendorId, 'S13');
            }
        });
    });

    test('Department-scoped employees read their surfaces without manage affordances', async ({
        browser,
        employeePage,
    }) => {
        const assetId = await requireAssetId(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
        const processId = await requireProcessId(E2E_PROCESSES.REGULATORY_REPORTING.l1_process);
        const vendorId = await requireVendorId(E2E_ICT_VENDOR.registration_id);
        const financeContext = await browser.newContext();
        const financeEmployeePage = await financeContext.newPage();
        let primaryFailure: unknown;
        try {
            await loginAsDemoUser(financeEmployeePage, DEMO_ACCOUNTS.EMPLOYEE_FINANCE);

            // Asset end: the seeded vendor link renders, no add form, no remove.
            await employeePage.goto(`/assets/${assetId}`);
            await waitForDataLoad(employeePage);
            await expect(employeePage.getByTestId('asset-vendor-links')).toBeVisible();
            await expect(employeePage.getByTestId('asset-vendor-link-add')).toHaveCount(0);
            await expect(employeePage.locator('[data-testid^="asset-vendor-link-remove-"]')).toHaveCount(0);

            // Process end: the §1 section renders read-only.
            await financeEmployeePage.goto(`/processes/${processId}`);
            await waitForDataLoad(financeEmployeePage);
            await expect(financeEmployeePage.getByTestId('process-vendor-links-section')).toBeVisible();
            await expect(
                financeEmployeePage.getByText(/^(No Vendors linked yet\.|Zatím žádní propojení dodavatelé\.)$/),
            ).toBeVisible();
            await expect(financeEmployeePage.getByTestId('process-vendor-link-add')).toHaveCount(0);
            await expect(financeEmployeePage.locator('[data-testid^="process-vendor-link-remove-"]')).toHaveCount(0);

            // Vendor end: both blocks render (dual-permission reads), rows carry
            // no remove buttons (per-row can_delete is false without write).
            await employeePage.goto(`/vendors/${vendorId}`);
            await waitForDataLoad(employeePage);
            await expect(employeePage.getByTestId('vendor-register-links-section')).toBeVisible();
            await expect(
                employeePage.getByTestId('vendor-asset-links').getByText(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name).first(),
            ).toBeVisible();
            await expect(employeePage.locator('[data-testid^="vendor-asset-link-remove-"]')).toHaveCount(0);
            await expect(employeePage.locator('[data-testid^="vendor-process-link-remove-"]')).toHaveCount(0);
        } catch (error) {
            primaryFailure = error;
            throw error;
        } finally {
            await cleanupWithoutMaskingPrimaryFailure(
                primaryFailure,
                () => financeContext.close(),
                test.info(),
            );
        }
    });
});
