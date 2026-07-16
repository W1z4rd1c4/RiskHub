import { describe, expect, it } from 'vitest';

import {
    ARCHIVED_CONTROL_BADGE_CLASS_NAME,
    formatControlGroupLabel,
    getControlDisplayStatus,
    getControlStatusColor,
} from '@/pages/controls/controlsPagePresentation';
import { ControlStatus } from '@/types/control';

describe('Controls page presentation helpers', () => {
    it('maps status colors', () => {
        expect(ARCHIVED_CONTROL_BADGE_CLASS_NAME).toContain('text-yellow-400');
        expect(getControlDisplayStatus({ status: 'active', is_archived: true })).toBe('archived');
        expect(getControlDisplayStatus({ status: 'inactive', is_archived: false })).toBe('inactive');
        expect(getControlStatusColor(ControlStatus.INACTIVE)).toContain('text-rose-400');
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
