import { describe, expect, it } from 'vitest';

import {
    buildProcessVendorLinkPayload,
    canDeleteProcessVendorLink,
    formatProcessVendorLinkMeta,
} from '@/pages/processes/processVendorLinksPresentation';
import type { ProcessVendorLink } from '@/types/process';

function sampleLink(overrides: Partial<ProcessVendorLink> = {}): ProcessVendorLink {
    return {
        id: 11,
        process_id: 5,
        vendor_id: 4,
        direct_service_description: 'Přímá dodávka datových služeb.',
        note: 'k revizi',
        capabilities: { can_delete: true },
        created_at: '2026-07-10T10:00:00Z',
        ...overrides,
    };
}

describe('Process vendor-links presentation helpers', () => {
    it('requires the vendor before a payload is buildable', () => {
        expect(buildProcessVendorLinkPayload({ vendor_id: '' })).toBeNull();
        expect(buildProcessVendorLinkPayload({ vendor_id: 'abc' })).toBeNull();
    });

    it('builds the entered sheet-11 §1 payload, trimming empties to nulls', () => {
        expect(
            buildProcessVendorLinkPayload({
                vendor_id: '4',
                direct_service_description: '  Přímá dodávka datových služeb. ',
                note: '',
            })
        ).toEqual({
            vendor_id: 4,
            direct_service_description: 'Přímá dodávka datových služeb.',
            note: null,
        });
    });

    it('formats the link meta line from the entered §1 columns', () => {
        expect(formatProcessVendorLinkMeta(sampleLink())).toBe(
            'Přímá dodávka datových služeb. · k revizi'
        );
        expect(
            formatProcessVendorLinkMeta(sampleLink({ direct_service_description: null, note: null }))
        ).toBe('');
    });

    it('gates the per-row remove action on the backend capability', () => {
        expect(canDeleteProcessVendorLink(sampleLink())).toBe(true);
        expect(
            canDeleteProcessVendorLink(sampleLink({ capabilities: { can_delete: false } }))
        ).toBe(false);
        expect(canDeleteProcessVendorLink(sampleLink({ capabilities: null }))).toBe(false);
    });
});
