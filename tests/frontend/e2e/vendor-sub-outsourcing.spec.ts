/**
 * ICT Register — Sub-outsourcing chains E2E (issue #45, deterministic fixtures).
 *
 * Asserts CURRENT behavior: the Sub-outsourcing section lives on the Vendor
 * detail behind the tab=sub-outsourcing deep-link, the flat 09_Subdodávky
 * collection renders as a full-depth chain (children indented under their
 * predecessor, one indent step per hop — authoritative Rank is derivation
 * ticket #49), the S-code dropdown carries the S01-S19 taxonomy verbatim,
 * and write-time chain integrity (predecessor must live on the SAME
 * contract) surfaces as a user-visible 422 error. Maintenance follows
 * vendor_contracts:write; the employee reads the chain without manage
 * affordances.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ICT_VENDOR, E2E_SUB_OUTSOURCING, E2E_VENDOR_CONTRACTS } from './fixtures/e2e-data';
import { getVendorByRegistration } from './helpers/api-auth';
import {
    createSubOutsourcingViaApi,
    getContractByReference,
    getSubOutsourcingByName,
} from './helpers/ict-register';
import { VendorDetailPage } from './pages/VendorDetailPage';

// S01-S19 ICT service taxonomy, verbatim workbook labels (spec section 3.2);
// the dropdown renders each option as "<code> — <label>".
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

// One indent step per predecessor hop (DEPTH_INDENT_PX in the presentation).
const DEPTH_INDENT = '20px';
const NO_INDENT = '0px';

const MUTATION_ERROR = /Saving the sub-outsourcing entry failed|Uložení subdodávky se nezdařilo/;

async function seededVendorId(): Promise<number> {
    const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
    if (!vendor) {
        throw new Error(`Vendor '${E2E_ICT_VENDOR.registration_id}' not found — run the deterministic E2E seed first.`);
    }
    return vendor.id;
}

test.describe('ICT Register — Sub-outsourcing chains (Deterministic)', () => {
    test('Deep-link tab=sub-outsourcing lands on the section with the seeded chain', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');

        // tab=sub-outsourcing resolves to a scroll target, so the URL is NOT
        // normalized away. The scroll itself is best-effort — later-loading
        // sections reflow the page — so the stable contract is URL retention
        // + the anchored section rendering.
        await expect(riskManagerPage).toHaveURL(new RegExp(`/vendors/${vendorId}\\?tab=sub-outsourcing$`));
        await expect(detailPage.subOutsourcingSection).toBeVisible();

        // All three seeded chain links render, carrying their S-codes.
        for (const fixture of [
            E2E_SUB_OUTSOURCING.DIRECT_PRIMARY,
            E2E_SUB_OUTSOURCING.DIRECT_SECONDARY,
            E2E_SUB_OUTSOURCING.RANK_3,
        ]) {
            const row = detailPage.subOutsourcingRowByText(fixture.sub_provider_name);
            await expect(row).toBeVisible();
            await expect(row.getByText(fixture.ict_service_code, { exact: true })).toBeVisible();
        }
    });

    test('Chain renders full depth: the rank-3 link is indented under its predecessor', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const directPrimary = await getSubOutsourcingByName(
            vendorId,
            E2E_SUB_OUTSOURCING.DIRECT_PRIMARY.sub_provider_name,
        );
        const directSecondary = await getSubOutsourcingByName(
            vendorId,
            E2E_SUB_OUTSOURCING.DIRECT_SECONDARY.sub_provider_name,
        );
        const rank3 = await getSubOutsourcingByName(vendorId, E2E_SUB_OUTSOURCING.RANK_3.sub_provider_name);
        expect(directPrimary).not.toBeNull();
        expect(directSecondary).not.toBeNull();
        expect(rank3).not.toBeNull();
        expect(rank3!.predecessor_id).toBe(directPrimary!.id);

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');

        // Directs sit flush left; the deeper link indents one step and carries
        // the chain glyph.
        const primaryCell = riskManagerPage.getByTestId(`vendor-sub-outsourcing-provider-${directPrimary!.id}`);
        const secondaryCell = riskManagerPage.getByTestId(`vendor-sub-outsourcing-provider-${directSecondary!.id}`);
        const rank3Cell = riskManagerPage.getByTestId(`vendor-sub-outsourcing-provider-${rank3!.id}`);
        await expect(primaryCell).toBeVisible();
        await expect(primaryCell).toHaveCSS('padding-left', NO_INDENT);
        await expect(secondaryCell).toHaveCSS('padding-left', NO_INDENT);
        await expect(rank3Cell).toHaveCSS('padding-left', DEPTH_INDENT);
        await expect(rank3Cell).toContainText('↳');

        // Depth-first order: the child renders directly under its predecessor,
        // BEFORE the second direct — the flat collection is regrouped by chain.
        const rowTexts = await detailPage.subOutsourcingSection.locator('tbody tr').allTextContents();
        const rowIndexOf = (name: string) => rowTexts.findIndex((text) => text.includes(name));
        const primaryIndex = rowIndexOf(E2E_SUB_OUTSOURCING.DIRECT_PRIMARY.sub_provider_name);
        const rank3Index = rowIndexOf(E2E_SUB_OUTSOURCING.RANK_3.sub_provider_name);
        const secondaryIndex = rowIndexOf(E2E_SUB_OUTSOURCING.DIRECT_SECONDARY.sub_provider_name);
        expect(primaryIndex).toBeGreaterThanOrEqual(0);
        expect(rank3Index).toBe(primaryIndex + 1);
        expect(secondaryIndex).toBeGreaterThan(rank3Index);
    });

    test('Add a direct entry via the dialog with the verbatim S-code taxonomy', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const uniqueName = `E2E-SUB-UI-DIRECT ${Date.now()}`;

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
        // The seeded row's contract label proves the contracts query resolved,
        // so the form's contract dropdown is guaranteed to carry options.
        await expect(
            detailPage
                .subOutsourcingRowByText(E2E_SUB_OUTSOURCING.DIRECT_PRIMARY.sub_provider_name)
                .getByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, { exact: true }),
        ).toBeVisible();

        await riskManagerPage.getByTestId('vendor-sub-outsourcing-add').click();
        await expect(riskManagerPage.getByTestId('vendor-sub-outsourcing-form')).toBeVisible();

        // Every chain hangs off a Contract of this vendor.
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-contract_id').click();
        await riskManagerPage
            .getByRole('option', { name: E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, exact: true })
            .click();

        // The S-code dropdown carries the S01-S19 taxonomy verbatim, in order.
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-ict_service_code').click();
        await expect(riskManagerPage.getByRole('option')).toHaveCount(ICT_SERVICE_OPTIONS.length + 1); // + "Not set"
        const optionTexts = await riskManagerPage.getByRole('option').allTextContents();
        expect(optionTexts.slice(1)).toEqual(ICT_SERVICE_OPTIONS);
        await riskManagerPage.getByRole('option', { name: ICT_SERVICE_OPTIONS[2], exact: true }).click();

        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-country').click();
        await riskManagerPage.getByRole('option', { name: 'CZ', exact: true }).click();
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-sub_provider_name').fill(uniqueName);
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-form-save').click();
        await expect(riskManagerPage.getByTestId('vendor-sub-outsourcing-form')).toHaveCount(0);

        // The new direct renders flush left with its S-code.
        const createdRow = detailPage.subOutsourcingRowByText(uniqueName);
        await expect(createdRow).toBeVisible();
        await expect(createdRow.getByText('S03', { exact: true })).toBeVisible();
        const created = await getSubOutsourcingByName(vendorId, uniqueName);
        expect(created).not.toBeNull();
        expect(created!.predecessor_id).toBeNull();
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-provider-${created!.id}`),
        ).toHaveCSS('padding-left', NO_INDENT);
    });

    test('Add a deeper entry by choosing a predecessor on the same contract', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const uniqueName = `E2E-SUB-UI-DEEP ${Date.now()}`;
        const predecessor = await getSubOutsourcingByName(
            vendorId,
            E2E_SUB_OUTSOURCING.DIRECT_SECONDARY.sub_provider_name,
        );
        expect(predecessor).not.toBeNull();

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
        // The seeded row's contract label proves the contracts query resolved,
        // so the form's contract dropdown is guaranteed to carry options.
        await expect(
            detailPage
                .subOutsourcingRowByText(E2E_SUB_OUTSOURCING.DIRECT_SECONDARY.sub_provider_name)
                .getByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, { exact: true }),
        ).toBeVisible();

        await riskManagerPage.getByTestId('vendor-sub-outsourcing-add').click();
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-contract_id').click();
        await riskManagerPage
            .getByRole('option', { name: E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, exact: true })
            .click();

        // The predecessor choices are scoped to the chosen Contract's entries.
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-predecessor_id').click();
        await expect(
            riskManagerPage.getByRole('option', {
                name: E2E_SUB_OUTSOURCING.DIRECT_PRIMARY.sub_provider_name,
                exact: true,
            }),
        ).toBeVisible();
        await riskManagerPage
            .getByRole('option', { name: E2E_SUB_OUTSOURCING.DIRECT_SECONDARY.sub_provider_name, exact: true })
            .click();

        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-sub_provider_name').fill(uniqueName);
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-form-save').click();
        await expect(riskManagerPage.getByTestId('vendor-sub-outsourcing-form')).toHaveCount(0);

        // The deeper link persists its predecessor and renders indented.
        const createdRow = detailPage.subOutsourcingRowByText(uniqueName);
        await expect(createdRow).toBeVisible();
        const created = await getSubOutsourcingByName(vendorId, uniqueName);
        expect(created).not.toBeNull();
        expect(created!.predecessor_id).toBe(predecessor!.id);
        const createdCell = riskManagerPage.getByTestId(`vendor-sub-outsourcing-provider-${created!.id}`);
        await expect(createdCell).toHaveCSS('padding-left', DEPTH_INDENT);
        await expect(createdCell).toContainText('↳');
    });

    test('Moving a chained entry to another contract surfaces the 422 as a user-visible error', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const rank3 = await getSubOutsourcingByName(vendorId, E2E_SUB_OUTSOURCING.RANK_3.sub_provider_name);
        expect(rank3).not.toBeNull();
        expect(rank3!.predecessor_id).not.toBeNull();

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
        // The seeded row's contract label proves the contracts query resolved,
        // so the edit form's contract dropdown is guaranteed to carry options.
        await expect(
            detailPage
                .subOutsourcingRowByText(E2E_SUB_OUTSOURCING.RANK_3.sub_provider_name)
                .getByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, { exact: true }),
        ).toBeVisible();

        // Re-target the chained entry at the OTHER contract while its
        // predecessor stays on the original one.
        await riskManagerPage.getByTestId(`vendor-sub-outsourcing-edit-${rank3!.id}`).click();
        await expect(riskManagerPage.getByTestId('vendor-sub-outsourcing-form')).toBeVisible();
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-field-contract_id').click();
        await riskManagerPage
            .getByRole('option', { name: E2E_VENDOR_CONTRACTS.SECOND_MAIN.contract_reference, exact: true })
            .click();

        const [patchResponse] = await Promise.all([
            riskManagerPage.waitForResponse(
                (response) =>
                    response.url().includes(`/vendors/${vendorId}/sub-outsourcing/${rank3!.id}`) &&
                    response.request().method() === 'PATCH',
            ),
            riskManagerPage.getByTestId('vendor-sub-outsourcing-form-save').click(),
        ]);
        // Write-time chain integrity: predecessor must live on the same contract.
        expect(patchResponse.status()).toBe(422);
        await expect(detailPage.subOutsourcingSection.getByText(MUTATION_ERROR)).toBeVisible();

        // Nothing moved: after closing the form, the entry still sits on its
        // original contract with its indentation intact.
        await riskManagerPage.getByTestId('vendor-sub-outsourcing-form-cancel').click();
        const row = detailPage.subOutsourcingRowByText(E2E_SUB_OUTSOURCING.RANK_3.sub_provider_name);
        await expect(row.getByText(E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference, { exact: true })).toBeVisible();
        const stillChained = await getSubOutsourcingByName(vendorId, E2E_SUB_OUTSOURCING.RANK_3.sub_provider_name);
        expect(stillChained!.contract_id).toBe(rank3!.contract_id);
        expect(stillChained!.predecessor_id).toBe(rank3!.predecessor_id);
    });

    test('Archive and restore an entry round-trip through the section row actions', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        const contract = await getContractByReference(
            vendorId,
            E2E_VENDOR_CONTRACTS.MAIN_ROI.contract_reference,
        );
        expect(contract).not.toBeNull();
        const uniqueName = `E2E-SUB-LC ${Date.now()}`;
        const created = await createSubOutsourcingViaApi(vendorId, {
            contract_id: contract!.id,
            sub_provider_name: uniqueName,
            country: 'NL',
            ict_service_code: 'S13',
        });

        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');
        await expect(detailPage.subOutsourcingRowByText(uniqueName)).toBeVisible();

        // Archive: the row swaps its actions to restore-only.
        await riskManagerPage.getByTestId(`vendor-sub-outsourcing-archive-${created.id}`).click();
        await expect(riskManagerPage.getByTestId(`vendor-sub-outsourcing-restore-${created.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`vendor-sub-outsourcing-archive-${created.id}`)).toHaveCount(0);
        await expect(riskManagerPage.getByTestId(`vendor-sub-outsourcing-edit-${created.id}`)).toHaveCount(0);

        // Restore: edit and archive come back, restore disappears.
        await riskManagerPage.getByTestId(`vendor-sub-outsourcing-restore-${created.id}`).click();
        await expect(riskManagerPage.getByTestId(`vendor-sub-outsourcing-archive-${created.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`vendor-sub-outsourcing-edit-${created.id}`)).toBeVisible();
        await expect(riskManagerPage.getByTestId(`vendor-sub-outsourcing-restore-${created.id}`)).toHaveCount(0);
    });

    test('Employee sees the Sub-outsourcing chain read-only: no manage affordances', async ({ employeePage }) => {
        const vendorId = await seededVendorId();

        const detailPage = new VendorDetailPage(employeePage);
        await detailPage.navigateToSection(vendorId, 'sub-outsourcing');

        // vendor_contracts:read renders the chain with the seeded rows...
        await expect(detailPage.subOutsourcingSection).toBeVisible();
        await expect(
            detailPage.subOutsourcingRowByText(E2E_SUB_OUTSOURCING.DIRECT_PRIMARY.sub_provider_name),
        ).toBeVisible();
        // ...but without vendor_contracts:write there is no add, edit, archive, or restore.
        await expect(employeePage.getByTestId('vendor-sub-outsourcing-add')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="vendor-sub-outsourcing-edit-"]')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="vendor-sub-outsourcing-archive-"]')).toHaveCount(0);
        await expect(employeePage.locator('[data-testid^="vendor-sub-outsourcing-restore-"]')).toHaveCount(0);
    });
});
