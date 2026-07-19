import { afterEach, describe, expect, it, vi } from 'vitest';

import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { riskRegisterLinksApi } from '@/services/threatApi';

const queued = {
    status: 'approval_required',
    message: 'Submitted',
    approval_id: 85,
    action_type: 'edit',
    pending_fields: ['relationship'],
    proposal_id: 'proposal-85',
    proposal_version: 1,
};

function queuedResponse(actionType: 'edit' | 'archive' = 'edit') {
    return new Response(JSON.stringify({ ...queued, action_type: actionType }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => vi.unstubAllGlobals());

describe('governed Process mutation API contracts', () => {
    it('sends the mandatory archive reason and parses the queued union', async () => {
        const fetchMock = vi.fn().mockResolvedValue(queuedResponse('archive'));
        vi.stubGlobal('fetch', fetchMock);
        await expect(processApi.archiveProcess(7, 'Lifecycle complete')).resolves.toMatchObject({
            action_type: 'archive',
            approval_id: 85,
        });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
            request_reason: 'Lifecycle complete',
        });
    });

    it('sends reasons for Process links from every writable end', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(queuedResponse())
            .mockResolvedValueOnce(queuedResponse())
            .mockResolvedValueOnce(queuedResponse());
        vi.stubGlobal('fetch', fetchMock);

        await processApi.addVendorLink(7, { vendor_id: 11, request_reason: 'New supplier' });
        await assetApi.addProcessLink(12, { process_id: 7, request_reason: 'Primary dependency' });
        await riskRegisterLinksApi.removeProcessLink(13, 14, 'Risk remapped');

        const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
        expect(bodies).toEqual([
            { vendor_id: 11, request_reason: 'New supplier' },
            { process_id: 7, request_reason: 'Primary dependency' },
            { request_reason: 'Risk remapped' },
        ]);
    });
});
