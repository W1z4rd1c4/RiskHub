import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const script = path.resolve(process.cwd(), 'scripts/quality/validate-login-dependency-graph.mjs');
const prefix = '/repo/frontend';

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');
}

function readGraphResult(output: string): { ok: boolean; errors: string[] } {
    const result: unknown = JSON.parse(output);
    if (!result || typeof result !== 'object' || !('ok' in result) || typeof result.ok !== 'boolean') {
        throw new Error('Graph validator must return a JSON object with a boolean ok field');
    }
    const errors = 'errors' in result ? result.errors : [];
    if (!isStringArray(errors)) throw new Error('Graph validator errors must be strings');
    return { ok: result.ok, errors };
}

function checkGraph(extraModules: string[], attachment: 'main' | 'locale-cs' = 'main') {
    const root = mkdtempSync(path.join(tmpdir(), 'riskhub-login-graph-'));
    try {
        for (const directory of ['scripts/quality', '.cache', 'dist/assets']) mkdirSync(path.join(root, directory), { recursive: true });
        const target = path.join(root, 'scripts/quality/validate-login-dependency-graph.mjs');
        copyFileSync(script, target);
        const entries = [
            ['main', '/index.html'],
            ['login', '/src/pages/LoginPage.tsx'],
            ['protected', '/src/ProtectedApplication.tsx'],
            ['entra', '/src/services/entraAuth.ts'],
            ['locale-en', '/src/i18n/locales/en/index.ts'],
            ['locale-cs', '/src/i18n/locales/cs/index.ts'],
            ['shared', '/src/components/ui/inline-message.tsx'],
        ];
        const chunks = entries.map(([name, suffix]) => ({
            fileName: `assets/${name}.js`,
            facadeModuleId: `${prefix}${suffix}`,
            isEntry: name === 'main',
            imports: name === attachment ? ['assets/shared.js'] : [],
            modules: [`${prefix}${suffix}`, ...(name === 'shared' ? extraModules.map((id) => `${prefix}${id}`) : [])],
        }));
        for (const chunk of chunks) writeFileSync(path.join(root, 'dist', chunk.fileName), 'export {};');
        writeFileSync(path.join(root, '.cache/login-dependency-graph.json'), JSON.stringify({ chunks }));
        return spawnSync(process.execPath, [target], { encoding: 'utf8' });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

describe('cold-login schema boundary', () => {
    it('allows public auth and preference hydration schemas', () => {
        const result = checkGraph([
            '/src/services/api/schemas/auth.ts',
            '/src/services/api/schemas/common.ts',
            '/src/services/api/schemas/entities/preferences.ts',
        ]);
        expect(result.status, result.stderr).toBe(0);
        expect(readGraphResult(result.stdout).ok).toBe(true);
    });

    it.each([
        '/src/services/api/schemas/entities/risk.ts',
        '/src/services/api/schemas/entities/index.ts',
    ])('rejects transitive business schemas: %s', (module) => {
        const result = checkGraph([module]);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('business entity schemas');
        expect(result.stderr).toContain(module);
    });

    it('checks the Czech closure independently', () => {
        const result = checkGraph(['/src/services/api/schemas/entities/control.ts'], 'locale-cs');
        expect(result.status).toBe(1);
        const { errors } = readGraphResult(result.stderr);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Cold cs login statically includes business entity schemas');
    });
});
