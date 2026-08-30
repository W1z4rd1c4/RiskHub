import { describe, expect, it } from 'vitest';

import {
    buildApprovalPageParams,
    parseApprovalWorkbenchQuery,
    updateApprovalWorkbenchQuery,
} from '@/pages/approvals/approvalWorkbenchQuery';

describe('approval workbench query contract', () => {
    it.each(['pending', 'mine', 'risk_assessment', 'all'] as const)(
        'accepts the %s tab from a direct URL',
        (tab) => {
            expect(parseApprovalWorkbenchQuery(new URLSearchParams({ tab })).state.tab).toBe(tab);
        },
    );

    it('normalizes invalid owned values while preserving unrelated context', () => {
        const parsed = parseApprovalWorkbenchQuery(
            new URLSearchParams('tab=unknown&q=%20vendor%20&page=0&approvalId=hidden&source=governance'),
        );

        expect(parsed.state).toEqual({
            tab: 'pending',
            query: 'vendor',
            page: 1,
            approvalId: null,
        });
        expect(parsed.normalizedParams.toString()).toBe('tab=pending&q=vendor&source=governance');
        expect(parsed.needsNormalization).toBe(true);
    });

    it('updates one URL-owned choice without discarding selection or unrelated context', () => {
        const current = new URLSearchParams(
            'tab=pending&q=vendor&page=4&approvalId=85&source=governance',
        );

        expect(updateApprovalWorkbenchQuery(current, { query: '  process  ' }).toString()).toBe(
            'tab=pending&q=process&approvalId=85&source=governance',
        );
        expect(updateApprovalWorkbenchQuery(current, { tab: 'mine' }).toString()).toBe(
            'tab=mine&q=vendor&approvalId=85&source=governance',
        );
        expect(updateApprovalWorkbenchQuery(current, { page: 2 }).toString()).toBe(
            'tab=pending&q=vendor&page=2&approvalId=85&source=governance',
        );
        expect(updateApprovalWorkbenchQuery(current, { approvalId: null }).toString()).toBe(
            'tab=pending&q=vendor&page=4&source=governance',
        );
    });

    it('builds the server page from the normalized tab, search, and page', () => {
        expect(buildApprovalPageParams({
            tab: 'mine',
            query: 'Asset A-17',
            page: 3,
            approvalId: 85,
        })).toEqual({
            my_requests: true,
            q: 'Asset A-17',
            skip: 200,
            limit: 100,
        });
    });
});
