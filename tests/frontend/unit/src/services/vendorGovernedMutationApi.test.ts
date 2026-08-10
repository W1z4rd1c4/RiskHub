import { afterEach, describe, expect, it, vi } from 'vitest';

import { vendorApi } from '@/services/vendorApi';

const queued = {
    status: 'approval_required',
    message: 'Submitted for independent review',
    approval_id: 87,
    action_type: 'edit',
    pending_fields: ['name'],
    proposal_id: 'proposal-87',
    proposal_version: 1,
};

function queuedResponse(actionType: 'edit' | 'archive' = 'edit') {
    return new Response(JSON.stringify({ ...queued, action_type: actionType }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => vi.unstubAllGlobals());

describe('governed Vendor mutation API contracts', () => {
    it('sends an edit reason and parses the typed queued response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(queuedResponse());
        vi.stubGlobal('fetch', fetchMock);

        await expect(vendorApi.updateVendor(7, {
            name: 'Critical hosting partner',
            request_reason: 'Material resilience change',
        })).resolves.toMatchObject({
            approval_id: 87,
            proposal_id: 'proposal-87',
        });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
            name: 'Critical hosting partner',
            request_reason: 'Material resilience change',
        });
    });

    it('sends the mandatory archive reason and parses the typed queued response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(queuedResponse('archive'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(vendorApi.archiveVendor(7, 'Vendor relationship ended')).resolves.toMatchObject({
            action_type: 'archive',
            approval_id: 87,
        });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
            request_reason: 'Vendor relationship ended',
        });
    });
});
