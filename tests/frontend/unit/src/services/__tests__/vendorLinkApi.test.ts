import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vendorLinkApi } from '@/services/vendorLinkApi';

describe('vendorLinkApi link responses', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts linked JSON payloads for risk, control, and KRI link creation', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (
                !url.endsWith('/api/v1/vendors/9/linked-risks')
                && !url.endsWith('/api/v1/vendors/9/linked-controls')
                && !url.endsWith('/api/v1/vendors/9/linked-kris')
            ) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(JSON.stringify({ status: 'linked' }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(vendorLinkApi.linkRisk(9, 101)).resolves.toBeUndefined();
        await expect(vendorLinkApi.linkControl(9, 102)).resolves.toBeUndefined();
        await expect(vendorLinkApi.linkKRI(9, 103)).resolves.toBeUndefined();
    });
});
