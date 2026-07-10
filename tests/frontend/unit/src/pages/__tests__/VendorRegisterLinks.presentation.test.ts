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
        direct_service_description: 'Přímá dodávka datových služeb.',
        note: null,
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Vendor register-links presentation helpers', () => {
    it('names the Asset end of each row and keeps a fallback for unknown ids', () => {
        const rows = buildVendorAssetLinkRows(
            [
                assetLink(),
                assetLink({
                    id: 8,
                    asset_id: 99,
                    ict_service_code: 'S14',
                    vendor_role: null,
                    contract_reference: null,
                    reliance: null,
                }),
            ],
            new Map([[3, 'Veris']]),
        );
        expect(rows.map((row) => row.name)).toEqual(['Veris', '#99']);
        expect(rows.map((row) => row.meta)).toEqual([
            'Dodává · S02 · SML-2020-001 · Úplná závislost',
            'S14',
        ]);
    });

    it('gates the per-row remove action on the backend capability', () => {
        const rows = buildVendorAssetLinkRows(
            [assetLink(), assetLink({ id: 8, capabilities: { can_delete: false } })],
            new Map(),
        );
        expect(rows.map((row) => row.canDelete)).toEqual([true, false]);
    });

    it('names the Process end using the workbook display name convention', () => {
        const rows = buildVendorProcessLinkRows(
            [processLink(), processLink({ id: 12, process_id: 6, capabilities: null })],
            new Map([[5, 'Správa pojistných smluv – Upisování']]),
        );
        expect(rows.map((row) => row.name)).toEqual(['Správa pojistných smluv – Upisování', '#6']);
        expect(rows[0].meta).toBe('Přímá dodávka datových služeb.');
        expect(rows.map((row) => row.canDelete)).toEqual([true, false]);
    });
});
