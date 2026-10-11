import { describe, expect, it, vi } from 'vitest';
import type { Page, Route } from '@playwright/test';
import { assetSchema, processSchema } from '@/services/api/schemas';
import { installDialogContractApi } from '../../../e2e/helpers/dialogContractHarness';

vi.mock('@playwright/test', () => ({ expect: vi.fn() }));

async function requestFixture(path: string, method = 'GET') {
    let handler: (route: Route) => Promise<void> = async () => { throw new Error('Route not installed'); };
    const unexpected: string[] = [];
    const page = { route: vi.fn(async (_pattern: string, callback: (route: Route) => Promise<void>) => { handler = callback; }) } as unknown as Page;
    await installDialogContractApi(page, unexpected);
    const fulfill = vi.fn();
    await handler({
        request: () => ({ method: () => method, url: () => `http://localhost${path}` }),
        fulfill,
    } as unknown as Route);
    return { unexpected, response: fulfill.mock.calls[0][0] };
}

describe('dialog contract exact counterpart reads', () => {
    it.each([
        ['/api/v1/assets/1', assetSchema],
        ['/api/v1/processes/1', processSchema],
    ] as const)('provides a schema-valid current capability at %s', async (path, schema) => {
        const { unexpected, response } = await requestFixture(path);
        expect(unexpected).toEqual([]);
        expect(response.status).toBe(200);
        const record = schema.parse(JSON.parse(response.body));
        expect(record.id).toBe(1);
        expect(record.is_archived).toBe(false);
        expect(record.capabilities?.protected_change_requires_approval).toBe(false);
    });

    it.each([
        ['/api/v1/assets/2', 'GET'],
        ['/api/v1/processes/2', 'GET'],
        ['/api/v1/assets/1', 'POST'],
    ])('retains strict rejection for %s %s', async (path, method) => {
        const { unexpected, response } = await requestFixture(path, method);
        expect(unexpected).toEqual([`${method} ${path}`]);
        expect(response.status).toBe(500);
    });
});
