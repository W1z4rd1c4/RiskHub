import { describe, expect, it } from 'vitest';

import {
    formatControlGroupLabel,
    getControlDisplayStatus,
} from '@/pages/controls/controlsPagePresentation';

describe('Controls page presentation helpers', () => {
    it('maps archived and inactive display states', () => {
        expect(getControlDisplayStatus({ status: 'active', is_archived: true })).toBe('archived');
        expect(getControlDisplayStatus({ status: 'inactive', is_archived: false })).toBe('inactive');
    });

    it('formats server group fallback labels', () => {
        expect(
            formatControlGroupLabel(
                { value: '__unlinked_vendor__', label: '__unlinked_vendor__', count: 1 },
                {
                    unlinkedVendor: 'Unlinked Vendor',
                    uncategorized: 'Uncategorized',
                    unknownDepartment: 'Unknown Department',
                    noProcess: 'No Process',
                    unknownRiskType: 'Unknown type',
                    unknownRisk: 'Unknown risk',
                    controlForm: (value) => value.toUpperCase(),
                },
            )
        ).toBe('Unlinked Vendor');
    });
});
