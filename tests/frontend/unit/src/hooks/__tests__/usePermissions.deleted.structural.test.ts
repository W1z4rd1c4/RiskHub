import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../../');
const hookName = 'use' + 'Permissions';
const hookImportPath = '@/hooks/' + hookName;

function filesContainingHookImport(patterns: string[]) {
    const roots = patterns.map((pattern) => pattern.split('/**/')[0]);
    const files: string[] = [];
    const visit = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'dist' || entry.name === 'node_modules') {
                continue;
            }
            const path = resolve(dir, entry.name);
            if (entry.isDirectory()) {
                visit(path);
                continue;
            }
            if ((path.endsWith('.ts') || path.endsWith('.tsx')) && readFileSync(path, 'utf8').includes(hookImportPath)) {
                files.push(relative(repoRoot, path));
            }
        }
    };

    for (const root of roots) {
        visit(resolve(repoRoot, root));
    }

    return files;
}

describe('usePermissions deletion lock', () => {
    it('removes the passthrough hook file', () => {
        expect(existsSync(resolve(repoRoot, 'frontend/src/hooks', `${hookName}.ts`))).toBe(false);
    });

    it('removes production imports of the passthrough hook', () => {
        expect(filesContainingHookImport(['frontend/src/**/*.{ts,tsx}'])).toEqual([]);
    });

    it('removes test mocks of the passthrough hook', () => {
        expect(filesContainingHookImport(['tests/frontend/**/*.{ts,tsx}'])).toEqual([]);
    });
});
