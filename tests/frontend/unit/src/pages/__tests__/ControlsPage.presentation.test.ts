import { describe, expect, it } from 'vitest';

import {
    buildControlGroupedRows,
    buildControlListParams,
    getControlGroupByField,
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
            skip: 20,
            limit: 20,
            search: 'evidence',
            status: 'archived',
            monitoring_status: undefined,
            include_archived: true,
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
            skip: 0,
            limit: 20,
            search: 'passed',
            status: undefined,
            monitoring_status: 'passed',
            include_archived: false,
        });
    });

    it('maps supported grouped views and status colors', () => {
        expect(getControlGroupByField('risk')).toBe('risk_name');
        expect(getControlGroupByField('all')).toBeNull();
        expect(getControlStatusColor(ControlStatus.ARCHIVED)).toContain('text-yellow-400');
    });

    it('duplicates controls into vendor groups and falls back to unlinked vendor', () => {
        const rows = buildControlGroupedRows(
            [
                {
                    id: 1,
                    name: 'Vendor control',
                    description: 'Desc',
                    department_id: 2,
                    department_name: 'IT',
                    frequency: 'monthly',
                    risk_level: 3,
                    status: ControlStatus.ACTIVE,
                    control_form: 'manual',
                    linked_vendors: [
                        { id: 4, name: 'Acme Cloud' },
                        { id: 5, name: 'Shared Vendor' },
                    ],
                },
                {
                    id: 2,
                    name: 'Standalone control',
                    description: 'Desc',
                    department_id: 3,
                    department_name: 'Finance',
                    frequency: 'quarterly',
                    risk_level: 2,
                    status: ControlStatus.ACTIVE,
                    control_form: 'manual',
                    linked_vendors: [],
                },
            ],
            'vendor',
            { unlinkedVendor: 'Unlinked Vendor' },
        );

        expect(rows.map((row) => row.groupValue)).toEqual([
            'Acme Cloud',
            'Shared Vendor',
            'Unlinked Vendor',
        ]);
    });
});
