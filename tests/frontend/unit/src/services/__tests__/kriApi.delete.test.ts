import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kriApi } from '@/services/kriApi';

describe('kriApi delete responses', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts approval-created delete responses', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.includes('/api/v1/kris/21')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(JSON.stringify({
                message: 'Deletion request submitted for approval',
                approval_id: 77,
                action_type: 'delete',
            }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(kriApi.deleteKRI(21, 'Needs approval')).resolves.toMatchObject({
            approval_id: 77,
            action_type: 'delete',
        });
    });

    it('accepts immediate archive responses with no content', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.includes('/api/v1/kris/22')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(null, { status: 204 }));
        });

        await expect(kriApi.deleteKRI(22, 'Archive now')).resolves.toBeUndefined();
    });
});
