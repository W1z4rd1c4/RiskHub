/**
 * ICT Register — Vendor-cascade derivations E2E (issue #49, deterministic
 * fixtures).
 *
 * Asserts CURRENT engine-derived values live in the UI. Every expected value
 * below is HAND-DERIVED from the seeded graph and cross-checked by driving
 * the pure engine (derive_ict_register) with the same rows:
 *
 * - Vendor CIF two-path any-true: A1/A2 (both derived CIF yes via
 *   E2E-PROC-001's override) hit the asset path (2), the §1 pair to
 *   E2E-PROC-003 (CIF yes) hits the process path (1) -> cif = yes;
 *   cif_ret = own CIF -> yes -> tier = critical. The UI localizes those
 *   canonical API codes in the active language.
 * - Transitive §2 expansion (never persisted): AVL(A1) x PAL(P1,P2) +
 *   AVL(A2) x PAL(P1) = 3 rows, VAD-major order.
 * - Process dod_n = §1 + §2: E2E-PROC-001 flips to 2 (both transitive),
 *   E2E-PROC-003 to 1 (manual §1 only, no asset links).
 * - Sub-outsourcing ranks: directs 2/2, deeper 3; the seeded cross-contract
 *   row resolves to the "?" sentinel with the CHYBA ŘETĚZCE finding; every
 *   chain row carries the prime vendor's CIF (08!W) uniformly.
 * - Asset completeness (04!hotovo): E2E-ASSET-001 is complete; E2E-ASSET-002
 *   misses exactly the primary-Process designation pseudo-field.
 */
import { test, expect } from './fixtures/auth.fixture';
import { E2E_ASSETS, E2E_ICT_VENDOR, E2E_PROCESSES, E2E_SUB_OUTSOURCING } from './fixtures/e2e-data';
import { getVendorByRegistration } from './helpers/api-auth';
import {
    ensureVendorReplaceability,
    getAssetByName,
    getProcessByL1,
    getSubOutsourcingByName,
} from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';

const VENDOR_TIER_CRITICAL = 'Critical provider';
const CHAIN_ERROR_LABEL = /^(Broken supply chain|Chyba řetězce)$/;

// Engine-confirmed §2 rows for the seeded vendor, in VAD-major order.
const EXPECTED_TRANSITIVE_ROWS = [
    {
        process: 'E2E-PROC-001 Claims Intake – FNOL triage',
        cif: 'Yes',
        criticality: 'Critical',
        viaAsset: 'E2E-ASSET-001 Core Claims System',
    },
    {
        process: 'E2E-PROC-002 Policy Administration',
        cif: 'No',
        criticality: 'High',
        viaAsset: 'E2E-ASSET-001 Core Claims System',
    },
    {
        process: 'E2E-PROC-001 Claims Intake – FNOL triage',
        cif: 'Yes',
        criticality: 'Critical',
        viaAsset: 'E2E-ASSET-002 Claims Database',
    },
];

async function seededVendorId(): Promise<number> {
    const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
    if (!vendor) {
        throw new Error(`Vendor '${E2E_ICT_VENDOR.registration_id}' not found — run the deterministic E2E seed first.`);
    }
    return vendor.id;
}

test.describe('ICT Register — Vendor-cascade derivations (Deterministic)', () => {
    test('Vendor derived section shows the engine tier, two-path CIF, and explain inputs', async ({ riskManagerPage }) => {
        const vendorId = await seededVendorId();
        // Repair any drift: the committed register-extension round-trip test
        // leaves the vendor's Substituce value mutated.
        await ensureVendorReplaceability(vendorId, E2E_ICT_VENDOR.replaceability);

        const detailResponse = riskManagerPage.waitForResponse((response) =>
            response.url().endsWith(`/api/v1/vendors/${vendorId}`) && response.request().method() === 'GET',
        );
        await riskManagerPage.goto(`/vendors/${vendorId}`);
        await waitForDataLoad(riskManagerPage);

        const detail = await (await detailResponse).json() as {
            derived: { tier: string; cif: string; cif_chain: string };
            replaceability: string;
        };
        expect(detail.derived.tier).toBe('critical');
        expect(detail.derived.cif).toBe('yes');
        expect(detail.derived.cif_chain).toBe('yes');
        expect(detail.replaceability).toBe('highly_complex');

        const section = riskManagerPage.getByTestId('vendor-derived-section');
        await expect(section).toBeVisible();

        // Canonical API codes are rendered as localized English labels.
        await expect(riskManagerPage.getByTestId('vendor-derived-tier')).toHaveText(VENDOR_TIER_CRITICAL);
        await expect(riskManagerPage.getByTestId('vendor-derived-cif')).toHaveText('Yes');
        await expect(riskManagerPage.getByTestId('vendor-derived-cif-chain')).toHaveText('Yes');

        // Explain inputs localize the stored substitutability code and retain
        // the completeness gaps by stable field name (07!hotovo misses
        // the exit plan and — Kritický tier — the ex-ante assessment date).
        await expect(section.getByText('Highly complex substitutability').first()).toBeVisible();
        await expect(riskManagerPage.getByTestId('vendor-derived-missing')).toHaveText(
            'exit_plan_state, ex_ante_assessment_date',
        );

        // The derived-only §2 table: 3 rows, VAD-major order, exact content.
        await expect(riskManagerPage.getByTestId('vendor-derived-transitive')).toBeVisible();
        await expect(
            riskManagerPage.locator('[data-testid^="vendor-derived-transitive-row-"]'),
        ).toHaveCount(EXPECTED_TRANSITIVE_ROWS.length);
        for (const [index, expected] of EXPECTED_TRANSITIVE_ROWS.entries()) {
            const row = riskManagerPage.getByTestId(`vendor-derived-transitive-row-${index}`);
            await expect(row).toContainText(expected.process);
            await expect(row).toContainText(expected.cif);
            await expect(row).toContainText(expected.criticality);
            await expect(row).toContainText(expected.viaAsset);
        }
    });

    test('Sub-outsourcing rows carry authoritative Rank badges and the chain-error sentinel', async ({ riskManagerPage }) => {
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
        const broken = await getSubOutsourcingByName(vendorId, E2E_SUB_OUTSOURCING.BROKEN.sub_provider_name);
        expect(directPrimary).not.toBeNull();
        expect(directSecondary).not.toBeNull();
        expect(rank3).not.toBeNull();
        expect(broken).not.toBeNull();

        await riskManagerPage.goto(`/vendors/${vendorId}?tab=sub-outsourcing`);
        await waitForDataLoad(riskManagerPage);

        // Authoritative engine ranks (09!I): direct = 2, deeper = 3.
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-rank-${directPrimary!.id}`),
        ).toHaveText('2');
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-rank-${directSecondary!.id}`),
        ).toHaveText('2');
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-rank-${rank3!.id}`),
        ).toHaveText('3');

        // The cross-contract row renders the workbook "?" sentinel plus the
        // CHYBA ŘETĚZCE finding.
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-rank-${broken!.id}`),
        ).toContainText('?');
        const chainError = riskManagerPage.getByTestId(`vendor-sub-outsourcing-chain-error-${broken!.id}`);
        await expect(chainError).toBeVisible();
        await expect(chainError).toHaveText(CHAIN_ERROR_LABEL);
        // The healthy rows carry no chain-error finding.
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-chain-error-${directPrimary!.id}`),
        ).toHaveCount(0);

        // 08!W propagation: the prime vendor's CIF (yes) marks every row of
        // the chain as a critical service, uniformly — the broken row too.
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-critical-${directPrimary!.id}`),
        ).toBeVisible();
        await expect(
            riskManagerPage.getByTestId(`vendor-sub-outsourcing-critical-${broken!.id}`),
        ).toBeVisible();
    });

    test('Process detail shows the flipped dod_n and the derived §2 expansion', async ({ riskManagerPage }) => {
        const claimsIntake = await getProcessByL1(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
        const regulatoryReporting = await getProcessByL1(E2E_PROCESSES.REGULATORY_REPORTING.l1_process);
        expect(claimsIntake).not.toBeNull();
        expect(regulatoryReporting).not.toBeNull();

        // E2E-PROC-001: dod_n = 0 manual + 2 transitive (via ASSET-001 and
        // ASSET-002), with both §2 rows rendered.
        await riskManagerPage.goto(`/processes/${claimsIntake!.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('process-derived-vendor-count')).toHaveText('2');
        const transitive = riskManagerPage.getByTestId('process-derived-transitive');
        await expect(transitive).toBeVisible();
        await expect(
            riskManagerPage.locator('[data-testid^="process-derived-transitive-row-"]'),
        ).toHaveCount(2);
        await expect(riskManagerPage.getByTestId('process-derived-transitive-row-0')).toContainText(
            E2E_ICT_VENDOR.name,
        );
        await expect(riskManagerPage.getByTestId('process-derived-transitive-row-0')).toContainText(
            E2E_ASSETS.CORE_CLAIMS_SYSTEM.name,
        );
        await expect(riskManagerPage.getByTestId('process-derived-transitive-row-1')).toContainText(
            E2E_ASSETS.CLAIMS_DATABASE.name,
        );

        // E2E-PROC-003: dod_n = 1 manual §1 pair + 0 transitive (no asset
        // links), so the §2 table stays empty.
        await riskManagerPage.goto(`/processes/${regulatoryReporting!.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('process-derived-vendor-count')).toHaveText('1');
        await expect(
            riskManagerPage.locator('[data-testid^="process-derived-transitive-row-"]'),
        ).toHaveCount(0);
    });

    test('Asset detail shows the 04!hotovo completeness flag', async ({ riskManagerPage }) => {
        const completeAsset = await getAssetByName(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
        const incompleteAsset = await getAssetByName(E2E_ASSETS.CLAIMS_DATABASE.name);
        expect(completeAsset).not.toBeNull();
        expect(incompleteAsset).not.toBeNull();

        // E2E-ASSET-001: every completeness span filled AND a primary
        // Process designated -> "✓".
        await riskManagerPage.goto(`/assets/${completeAsset!.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('asset-derived-completeness')).toContainText('✓');
        await expect(riskManagerPage.getByTestId('asset-derived-missing')).not.toContainText(
            'primary_process',
        );

        // E2E-ASSET-002: fully entered but carries NO primary designation —
        // the proc_id pseudo-field is the exact (and only) gap.
        await riskManagerPage.goto(`/assets/${incompleteAsset!.id}`);
        await waitForDataLoad(riskManagerPage);
        await expect(riskManagerPage.getByTestId('asset-derived-completeness')).toContainText('⚠');
        await expect(riskManagerPage.getByTestId('asset-derived-missing')).toHaveText('primary_process');
    });
});
