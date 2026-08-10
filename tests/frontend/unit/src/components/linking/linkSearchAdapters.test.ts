import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchLinkTargets } from '@/components/linking/linkSearchAdapters';
import { buildControlCollectionQuery, controlApi } from '@/services/controlApi';
import { buildRiskCollectionQuery, riskApi } from '@/services/riskApi';
import type { ControlListParams } from '@/types/control';
import type { RiskListParams } from '@/types/risk';

const emptyCollection = { items: [], limit: 20, offset: 0, total: 0 };

function searchArgs(
    mode: 'control-to-risk' | 'risk-to-control',
    includeArchived: boolean,
) {
    return {
        mode,
        searchQuery: ' resilience ',
        selectedDeptId: 12,
        selectedProcess: 'Payments',
        selectedCategory: 'Operational',
        includeArchived,
        departments: [],
        linkedTargetIdSet: new Set<number | undefined>(),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Risk and Control link-search lifecycle contract', () => {
    it.each([
        { includeArchived: false, lifecycle: 'active' as const },
        { includeArchived: true, lifecycle: 'all' as const },
    ])('serializes Risk lifecycle=$lifecycle for includeArchived=$includeArchived', async ({ includeArchived, lifecycle }) => {
        const getRisks = vi.spyOn(riskApi, 'getRisks').mockResolvedValue(emptyCollection);

        await searchLinkTargets(searchArgs('control-to-risk', includeArchived));

        const params = getRisks.mock.calls[0]?.[0] as RiskListParams;
        expect(params).toMatchObject({
            lifecycle,
            search: ' resilience ',
            department_id: 12,
            process: 'Payments',
            category: 'Operational',
        });
        expect(params).not.toHaveProperty('include_archived');
        expect(JSON.parse(buildRiskCollectionQuery(params).get('filters') ?? '{}')).toMatchObject({ lifecycle });
    });

    it.each([
        { includeArchived: false, lifecycle: 'active' as const },
        { includeArchived: true, lifecycle: 'all' as const },
    ])('serializes Control lifecycle=$lifecycle for includeArchived=$includeArchived', async ({ includeArchived, lifecycle }) => {
        const getControls = vi.spyOn(controlApi, 'getControls').mockResolvedValue(emptyCollection);

        await searchLinkTargets(searchArgs('risk-to-control', includeArchived));

        const params = getControls.mock.calls[0]?.[0] as ControlListParams;
        expect(params).toMatchObject({
            lifecycle,
            search: ' resilience ',
            department_id: 12,
            process: 'Payments',
            category: 'Operational',
        });
        expect(params).not.toHaveProperty('include_archived');
        expect(JSON.parse(buildControlCollectionQuery(params).get('filters') ?? '{}')).toMatchObject({ lifecycle });
    });
});
