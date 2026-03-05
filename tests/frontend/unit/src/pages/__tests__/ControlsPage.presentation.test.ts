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
                statusFilter: ControlStatus.ARCHIVED,
            })
        ).toEqual({
            skip: 20,
            limit: 20,
            search: 'evidence',
            status: 'archived',
            include_archived: true,
        });
    });

    it('maps supported grouped views and status colors', () => {
        expect(getControlGroupByField('risk')).toBe('risk_name');
        expect(getControlGroupByField('all')).toBeNull();
        expect(getControlStatusColor(ControlStatus.ARCHIVED)).toContain('text-yellow-400');
    });
});
