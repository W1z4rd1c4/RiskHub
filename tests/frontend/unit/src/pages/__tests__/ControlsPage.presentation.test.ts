import { describe, expect, it } from 'vitest';

import {
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
});
