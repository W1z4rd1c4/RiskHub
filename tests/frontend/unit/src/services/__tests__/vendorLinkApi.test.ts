import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vendorLinkApi } from '@/services/vendorLinkApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';

const queuedBody = {
    status: 'approval_required',
    message: 'Protected Vendor relationship submitted for independent approval',
    approval_id: 187,
    action_type: 'edit',
    pending_fields: ['linked_risk'],
    proposal_id: 'proposal-vendor-link-187',
    proposal_version: 1,
};

/** The six governed Vendor link operations of ticket #100. */
const operations = [
    {
        name: 'linkRisk',
        invoke: (reason?: string) => vendorLinkApi.linkRisk(9, 101, reason),
        method: 'POST',
        path: '/api/v1/vendors/9/linked-risks',
        directStatus: 201,
        directBody: JSON.stringify({ status: 'linked' }),
        expectedPayload: { risk_id: 101 },
    },
    {
        name: 'unlinkRisk',
        invoke: (reason?: string) => vendorLinkApi.unlinkRisk(9, 101, reason),
        method: 'DELETE',
        path: '/api/v1/vendors/9/linked-risks/101',
        directStatus: 204,
        directBody: null,
        expectedPayload: {},
    },
    {
        name: 'linkControl',
        invoke: (reason?: string) => vendorLinkApi.linkControl(9, 102, reason),
        method: 'POST',
        path: '/api/v1/vendors/9/linked-controls',
        directStatus: 201,
        directBody: JSON.stringify({ status: 'linked' }),
        expectedPayload: { control_id: 102 },
    },
    {
        name: 'unlinkControl',
        invoke: (reason?: string) => vendorLinkApi.unlinkControl(9, 102, reason),
        method: 'DELETE',
        path: '/api/v1/vendors/9/linked-controls/102',
        directStatus: 204,
        directBody: null,
        expectedPayload: {},
    },
    {
        name: 'linkKRI',
        invoke: (reason?: string) => vendorLinkApi.linkKRI(9, 103, reason),
        method: 'POST',
        path: '/api/v1/vendors/9/linked-kris',
        directStatus: 201,
        directBody: JSON.stringify({ status: 'linked' }),
        expectedPayload: { kri_id: 103 },
    },
    {
        name: 'unlinkKRI',
        invoke: (reason?: string) => vendorLinkApi.unlinkKRI(9, 103, reason),
        method: 'DELETE',
        path: '/api/v1/vendors/9/linked-kris/103',
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

describe('vendorLinkApi governed mutation matrix (#100)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each(operations)(
        '$name forwards the collected request reason to $path',
        async ({ invoke, method, path, expectedPayload }) => {
            const fetchMock = mockFetchOnce(202, JSON.stringify(queuedBody));

            await invoke('Material register change');

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
                approval_id: 187,
                proposal_id: 'proposal-vendor-link-187',
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
            if (method === 'POST') {
                // A reason-less direct call must not invent a request_reason.
                expect(JSON.parse(String(init.body))).toEqual(expectedPayload);
            } else {
                expect(init.body ?? undefined).toBeUndefined();
            }
        },
    );
});
