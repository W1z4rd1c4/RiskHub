import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;
const allowlistPath = path.join(
    repoRoot,
    'tests/frontend/unit/src/architecture/capability-flag-fallback-allowlist.json',
);

type AllowlistEntry = {
    file: string;
    expression: string;
    owner: string;
    reason: string;
};

function loadAllowlist(): AllowlistEntry[] {
    return JSON.parse(readFileSync(allowlistPath, 'utf8')) as AllowlistEntry[];
}

describe('capability flag fallback allowlist', () => {
    it('documents every retained missing-capability fallback with owner and reason', () => {
        const entries = loadAllowlist();

        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(entry.file).toMatch(/^frontend\/src\//);
            expect(entry.expression.trim()).not.toEqual('');
            expect(entry.owner).toMatch(/^AUTHZ-/);
            expect(entry.reason).toMatch(/production|fail|compatibility|legacy/i);
        }
    });

    it('points each retained fallback exception at current source text', () => {
        for (const entry of loadAllowlist()) {
            const source = readFileSync(path.join(repoRoot, entry.file), 'utf8');
            expect(source).toContain(entry.expression);
        }
    });
});
