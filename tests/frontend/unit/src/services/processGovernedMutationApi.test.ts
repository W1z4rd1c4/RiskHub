import { afterEach, describe, expect, it, vi } from 'vitest';

import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorContractApi } from '@/services/vendorContractApi';
import { threatApi } from '@/services/threatApi';
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


describe('canonical governed request normalization (#246)', () => {
    it.each([
        ['Process', (reason: string) => processApi.archiveProcess(7, reason)],
        ['Asset', (reason: string) => assetApi.archiveAsset(8, reason)],
        ['Vendor', (reason: string) => vendorApi.archiveVendor(9, reason)],
        ['Vendor Contract', (reason: string) => vendorContractApi.archiveContract(9, 10, reason)],
        ['Risk/Threat link', (reason: string) => riskRegisterLinksApi.removeProcessLink(11, 12, reason)],
    ] as const)('normalizes %s DELETE without a blank body', async (_family, execute) => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(queuedResponse()));
        vi.stubGlobal('fetch', fetchMock);
        await execute('   ');
        expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
        await execute('  Independent review  ');
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ request_reason: 'Independent review' });
    });
    it('normalizes governed orphan intake without inventing an optional reason', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(queuedResponse()));
        vi.stubGlobal('fetch', fetchMock);
        const input = Object.freeze({ new_owner_id: 7, request_reason: '  Independent reassignment  ' });
        await orphanedItemsApi.resolveOrphan(8, input);
        await orphanedItemsApi.resolveOrphan(8, { new_owner_id: 7, request_reason: '  ' });
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ new_owner_id: 7, request_reason: 'Independent reassignment' });
        expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ new_owner_id: 7 });
        expect(input.request_reason).toBe('  Independent reassignment  ');
    });

    it('normalizes field payloads through each governed resource API without mutating callers', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(queuedResponse()));
        vi.stubGlobal('fetch', fetchMock);
        const input = Object.freeze({ name: 'Draft', request_reason: '  Review proposal  ' });
        await processApi.updateProcess(7, input);
        await assetApi.updateAsset(8, input);
        await vendorApi.updateVendor(9, input);
        await threatApi.updateThreat(10, input);
        for (const call of fetchMock.mock.calls) {
            expect(JSON.parse(String(call[1]?.body))).toEqual({ name: 'Draft', request_reason: 'Review proposal' });
        }
        expect(input.request_reason).toBe('  Review proposal  ');
        await assetApi.updateAsset(8, { name: 'Draft', request_reason: '   ' });
        expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ name: 'Draft' });
    });
});
