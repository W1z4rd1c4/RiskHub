import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import adminCs from '@/i18n/locales/cs/admin.json';
import adminEn from '@/i18n/locales/en/admin.json';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;

const auditedPaths = [
    'frontend/src/components/access',
    'frontend/src/components/users',
    'frontend/src/pages/UserNewPage.tsx',
    'frontend/src/pages/UsersPage.tsx',
    'frontend/src/pages/users',
    'frontend/src/pages/admin-console/sections/ops',
];

const requiredAdminKeys = [
    'sessions.revoke_failed',
    'users.auth_mode_load_failed',
    'users.auth_mode_service_unavailable',
    'users.break_glass',
    'users.break_glass_enable',
    'users.break_glass_enabling',
    'users.break_glass_expires_in_hours',
    'users.break_glass_failed',
    'users.break_glass_message',
    'users.break_glass_reason',
    'users.break_glass_success',
    'users.check_directory',
    'users.checking_directory',
    'users.directory_check_all_success',
    'users.directory_check_failed',
    'users.user_status_update_failed',
    'user_new.auth_mode_service_unavailable',
    'user_new.sso_import_help',
];

function productionFiles(entryPath: string): string[] {
    const fullPath = path.join(repoRoot, entryPath);
    if (!existsSync(fullPath)) return [];

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
        return readdirSync(fullPath).flatMap((entry) => productionFiles(path.join(entryPath, entry)));
    }
    return /\.(ts|tsx)$/.test(fullPath) && !/\.test\.(ts|tsx)$/.test(fullPath) ? [fullPath] : [];
}

function readPath(source: unknown, keyPath: string): unknown {
    return keyPath.split('.').reduce<unknown>((current, segment) => {
        if (current === null || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[segment];
    }, source);
}

describe('audited user/access i18n defaults', () => {
    it('does not keep inline defaultValue fallbacks in audited production files', () => {
        const violations = auditedPaths
            .flatMap(productionFiles)
            .flatMap((filePath) => {
                const source = readFileSync(filePath, 'utf8');
                return [...source.matchAll(/defaultValue\s*:/g)].map((match) => {
                    const line = source.slice(0, match.index).split('\n').length;
                    return `${path.relative(repoRoot, filePath)}:${line}`;
                });
            });

        expect(violations).toEqual([]);
    });

    it.each(requiredAdminKeys)('keeps %s in audited admin locale resources', (keyPath) => {
        expect(readPath(adminEn, keyPath)).toEqual(expect.any(String));
        expect(readPath(adminCs, keyPath)).toEqual(expect.any(String));
    });
});
