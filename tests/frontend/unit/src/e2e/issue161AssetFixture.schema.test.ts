import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetSchema } from '@/services/api/schemas';

const source = readFileSync(resolve(process.cwd(), '../tests/frontend/e2e/issue161-recoverable-actions.spec.ts'), 'utf8');
const fixtureFunction = source.slice(source.indexOf('function pendingAsset()'), source.indexOf('async function installMockApi'));

describe('issue161 recoverable Asset response fixture', () => {
    it('passes the production read schema with advisory state independent from the pending lock', () => {
        // Evaluate only the checked-in, pure object factory, not the browser suite.
        const fixture: unknown = runInNewContext(`(${fixtureFunction})();`, { TARGET_NAME: 'Customer account platform', APPROVAL_ID: 916 });
        const parsed = assetSchema.parse(fixture);
        expect(parsed.name).toBe('Customer account platform');
        expect(parsed.capabilities).toMatchObject({
            protected_change_requires_approval: false,
            has_pending_change: true,
            business_edit_blocked: true,
            can_cancel_pending_change: true,
        });
        expect(parsed.pending_change?.approval_id).toBe(916);
    });
});
