import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(
    process.cwd(),
    '../tests/frontend/e2e/permissions/risks-crud.spec.ts',
), 'utf8');

describe('Risk CRUD E2E cleanup', () => {
    it('restores the archived fixture in an afterEach hook rather than at the end of the restore test', () => {
        expect(source).toMatch(
            /test\.afterEach\([\s\S]*ensureRiskStatus\(E2E_RISKS\.ARCHIVE_RESTORE_TARGET\.code, 'archived'\)/,
        );

        const restoreTest = source.slice(source.indexOf("test('Risk Manager can restore archived risk"));
        expect(restoreTest).not.toContain(
            "await ensureRiskStatus(E2E_RISKS.ARCHIVE_RESTORE_TARGET.code, 'archived')",
        );
    });
});
