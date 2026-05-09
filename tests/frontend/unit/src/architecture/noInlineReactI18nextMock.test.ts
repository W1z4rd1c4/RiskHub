import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const unitRoot = path.resolve(process.cwd(), '../tests/frontend/unit');
const allowedInlineMocks = new Set([
    path.normalize('src/i18n/hooks.spec.tsx'),
]);

function listTestFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            return listTestFiles(fullPath);
        }
        if (!/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
            return [];
        }
        return [fullPath];
    });
}

describe('W6 frontend i18n test infrastructure', () => {
    it('keeps direct react-i18next mocks isolated to i18n hook tests', () => {
        const directReactI18nextMock = /vi\.mock\(\s*['"]react-i18next['"]/;
        const offenders = listTestFiles(unitRoot)
            .filter((filePath) => directReactI18nextMock.test(readFileSync(filePath, 'utf8')))
            .map((filePath) => path.normalize(path.relative(unitRoot, filePath)))
            .filter((relativePath) => !allowedInlineMocks.has(relativePath));

        expect(offenders).toEqual([]);
    });
});
