import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SESSION_DIR = path.resolve(process.cwd(), 'src/services/session');

describe('session module 4-file post-merge layout', () => {
    it('exposes exactly the new file set', () => {
        const expected = new Set(['types.ts', 'store.ts', 'sessionStorage.ts', 'coordinator.ts', 'index.ts']);
        const actual = new Set(fs.readdirSync(SESSION_DIR).filter((file) => file.endsWith('.ts')));

        expect(actual).toEqual(expected);
    });

    it('legacy files are gone', () => {
        for (const legacy of ['bootstrap.ts', 'manager.ts', 'sso.ts', 'refreshHint.ts', 'logoutSuppression.ts']) {
            expect(fs.existsSync(path.join(SESSION_DIR, legacy))).toBe(false);
        }
    });
});
