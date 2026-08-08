import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vendorSubOutsourcingApi } from '@/services/vendorSubOutsourcingApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';

const queuedBody = {
    status: 'approval_required',
    message: 'Protected Vendor sub-outsourcing change submitted for independent approval',
    approval_id: 186,
    action_type: 'edit',
    pending_fields: ['sub_outsourcing'],
    proposal_id: 'proposal-vendor-sub-outsourcing-186',
    proposal_version: 1,
};

const writePayload = { contract_id: 11, sub_provider_name: 'Fresh Sub Provider' };

const directEntryBody = JSON.stringify({
    id: 55,
    vendor_id: 9,
    contract_id: 11,
    sub_provider_name: 'Fresh Sub Provider',
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
});

/** The three governed sub-outsourcing operations of ticket #101. */
const operations = [
    {
        name: 'createEntry',
        invoke: (reason?: string) => vendorSubOutsourcingApi.createEntry(9, writePayload, reason),
        method: 'POST',
        path: '/api/v1/vendors/9/sub-outsourcing',
        directStatus: 201,
        directBody: directEntryBody,
        expectedPayload: writePayload,
    },
    {
        name: 'updateEntry',
        invoke: (reason?: string) => vendorSubOutsourcingApi.updateEntry(9, 55, writePayload, reason),
        method: 'PATCH',
        path: '/api/v1/vendors/9/sub-outsourcing/55',
        directStatus: 200,
        directBody: directEntryBody,
        expectedPayload: writePayload,
    },
    {
        name: 'archiveEntry',
        invoke: (reason?: string) => vendorSubOutsourcingApi.archiveEntry(9, 55, reason),
        method: 'DELETE',
        path: '/api/v1/vendors/9/sub-outsourcing/55',
        directStatus: 204,
        directBody: null,
        expectedPayload: {},
    },
] as const;

function mockFetchOnce(status: number, body: string | null) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
        status,
        headers: body === null ? undefined : { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('vendorSubOutsourcingApi governed mutation matrix (#101)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each(operations)(
        '$name forwards the TRIMMED request reason to $path',
        async ({ invoke, method, path, expectedPayload }) => {
            const fetchMock = mockFetchOnce(202, JSON.stringify(queuedBody));

            await invoke('  Material register change  ');

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(String(url).endsWith(path)).toBe(true);
            expect(init.method).toBe(method);
            expect(JSON.parse(String(init.body))).toEqual({
                ...expectedPayload,
                request_reason: 'Material register change',
            });
        },
    );

    it.each(operations)(
        '$name parses a 202 as QUEUED and never as direct success',
        async ({ invoke }) => {
            mockFetchOnce(202, JSON.stringify(queuedBody));

            const result = await invoke('Material register change');

            expect(isProcessApprovalQueuedResponse(result)).toBe(true);
            expect(result).toMatchObject({
                status: 'approval_required',
                approval_id: 186,
                proposal_id: 'proposal-vendor-sub-outsourcing-186',
                proposal_version: 1,
            });
        },
    );

    it.each(operations)(
        '$name surfaces the backend 422 reason-required rejection',
        async ({ invoke }) => {
            mockFetchOnce(422, JSON.stringify({
                detail: {
                    code: 'governed_mutation_reason_required',
                    message: 'A request reason is mandatory for a protected Vendor mutation',
                },
            }));

            await expect(invoke()).rejects.toMatchObject({ status: 422 });
        },
    );

    it.each(operations)(
        '$name parses the direct success shape and does not report it as queued',
        async ({ invoke, directStatus, directBody, expectedPayload, method }) => {
            const fetchMock = mockFetchOnce(directStatus, directBody);

            const result = await invoke();

            expect(isProcessApprovalQueuedResponse(result)).toBe(false);
            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(init.method).toBe(method);
            if (method === 'DELETE') {
                // A reason-less archive must not invent a request body.
                expect(init.body ?? undefined).toBeUndefined();
            } else {
                // A reason-less direct call must not invent a request_reason.
                expect(JSON.parse(String(init.body))).toEqual(expectedPayload);
            }
        },
    );
});
