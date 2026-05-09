import { describe, expect, it } from 'vitest';

import {
    ARCHIVED_CONTROL_BADGE_CLASS_NAME,
    buildControlListParams,
    formatControlGroupLabel,
    getControlDisplayStatus,
    getControlGroupBy,
    getControlStatusColor,
} from '@/pages/controls/controlsPagePresentation';
import { ControlStatus } from '@/types/control';

describe('Controls page presentation helpers', () => {
    it('builds archived list params with trimmed search text', () => {
        expect(
            buildControlListParams({
                currentPage: 2,
                limit: 20,
                search: '  evidence  ',
                statusFilter: 'archived',
            })
        ).toEqual({
            offset: 20,
            limit: 20,
            search: 'evidence',
            status: 'archived',
            monitoring_status: undefined,
            include_archived: true,
            group_by: undefined,
            group_value: undefined,
        });
    });

    it('builds monitoring status params without sending lifecycle status', () => {
        expect(
            buildControlListParams({
                currentPage: 1,
                limit: 20,
                search: '  passed  ',
                statusFilter: 'passed',
            })
        ).toEqual({
            offset: 0,
            limit: 20,
            search: 'passed',
            status: undefined,
            monitoring_status: 'passed',
            include_archived: false,
            group_by: undefined,
            group_value: undefined,
        });
    });

    it('maps supported grouped views and status colors', () => {
        expect(getControlGroupBy('risk')).toBe('risk');
        expect(getControlGroupBy('vendor')).toBe('vendor');
        expect(getControlGroupBy('all')).toBeNull();
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
