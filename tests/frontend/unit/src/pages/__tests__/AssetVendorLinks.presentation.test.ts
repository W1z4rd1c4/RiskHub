import { describe, expect, it } from 'vitest';

import {
    buildAssetVendorLinkPayload,
    canDeleteAssetVendorLink,
    formatAssetVendorLinkMeta,
} from '@/pages/assets/assetVendorLinksPresentation';
import type { AssetVendorLink } from '@/types/asset';

function sampleLink(overrides: Partial<AssetVendorLink> = {}): AssetVendorLink {
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

describe('Asset vendor-links presentation helpers', () => {
    it('requires the vendor and the S-code before a payload is buildable', () => {
        expect(
            buildAssetVendorLinkPayload({ vendor_id: '', ict_service_code: 'S02' })
        ).toBeNull();
        expect(
            buildAssetVendorLinkPayload({ vendor_id: '4', ict_service_code: '' })
        ).toBeNull();
    });

    it('builds the entered 10_VAD payload, trimming empties to nulls', () => {
        expect(
            buildAssetVendorLinkPayload({
                vendor_id: '4',
                ict_service_code: 'S02',
                vendor_role: ' Dodává ',
                contract_reference: '',
                reliance: 'Úplná závislost',
            })
        ).toEqual({
            vendor_id: 4,
            ict_service_code: 'S02',
            vendor_role: 'Dodává',
            contract_reference: null,
            reliance: 'Úplná závislost',
        });
    });

    it('formats the link meta line from the entered link columns', () => {
        expect(formatAssetVendorLinkMeta(sampleLink())).toBe(
            'Dodává · S02 · SML-2020-001 · Úplná závislost'
        );
        expect(
            formatAssetVendorLinkMeta(
                sampleLink({ vendor_role: null, contract_reference: null, reliance: null })
            )
        ).toBe('S02');
    });

    it('gates the per-row remove action on the backend capability', () => {
        expect(canDeleteAssetVendorLink(sampleLink())).toBe(true);
        expect(canDeleteAssetVendorLink(sampleLink({ capabilities: { can_delete: false } }))).toBe(false);
        expect(canDeleteAssetVendorLink(sampleLink({ capabilities: null }))).toBe(false);
    });
});
