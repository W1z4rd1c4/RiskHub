import { describe, expect, it } from 'vitest';

import {
    buildVendorAssetLinkRows,
    buildVendorProcessLinkRows,
} from '@/pages/vendors/vendorRegisterLinksPresentation';
import type { AssetVendorLink } from '@/types/asset';
import type { ProcessVendorLink } from '@/types/process';

function assetLink(overrides: Partial<AssetVendorLink> = {}): AssetVendorLink {
    return {
        id: 7,
        asset_id: 3,
        vendor_id: 4,
        asset_name: 'Veris',
        vendor_role: 'Dodává',
        ict_service_code: 'S02',
        contract_reference: 'SML-2020-001',
        reliance: 'Úplná závislost',
        note: null,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

function processLink(overrides: Partial<ProcessVendorLink> = {}): ProcessVendorLink {
    return {
        id: 11,
        process_id: 5,
        vendor_id: 4,
        process_name: 'Správa pojistných smluv – Upisování',
        process_business_edit_blocked: false,
        direct_service_description: 'Přímá dodávka datových služeb.',
        note: null,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Vendor register-links presentation helpers', () => {
    it('names the Asset end from the server-embedded display name, never a raw id', () => {
        const rows = buildVendorAssetLinkRows(
            [
                assetLink(),
                assetLink({
                    id: 8,
                    asset_id: 99,
                    asset_name: null,
                    ict_service_code: 'S14',
                    vendor_role: null,
                    contract_reference: null,
                    reliance: null,
                }),
            ],
            'Unknown asset',
        );
        // The unresolved end reads the i18n'd unknown label — no #99 fallback
        // (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
        expect(rows.map((row) => row.name)).toEqual(['Veris', 'Unknown asset']);
        expect(rows.map((row) => row.meta)).toEqual([
            'Dodává · S02 · SML-2020-001 · Úplná závislost',
            'S14',
        ]);
    });

    it('gates the per-row remove action on the backend capability', () => {
        const rows = buildVendorAssetLinkRows(
            [assetLink(), assetLink({ id: 8, capabilities: { can_delete: false } })],
            'Unknown asset',
        );
        expect(rows.map((row) => row.canDelete)).toEqual([true, false]);
    });

    it('names the Process end using the workbook display name convention', () => {
        const rows = buildVendorProcessLinkRows(
            [
                processLink(),
                processLink({ id: 12, process_id: 6, process_name: null, capabilities: null }),
            ],
            'Unknown process',
        );
        expect(rows.map((row) => row.name)).toEqual([
            'Správa pojistných smluv – Upisování',
            'Unknown process',
        ]);
        expect(rows[0].meta).toBe('Přímá dodávka datových služeb.');
        expect(rows.map((row) => row.canDelete)).toEqual([true, false]);
    });

    it('preserves the authoritative Process impact lock for Vendor-side actions', () => {
        const [row] = buildVendorProcessLinkRows(
            [processLink({ process_business_edit_blocked: true })],
            'Unknown process',
        );
        expect(row.processEditBlocked).toBe(true);
    });
});
