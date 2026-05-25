import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;

function readFrontendSource(relativePath: string): string {
    return readFileSync(path.join(repoRoot, 'frontend', relativePath), 'utf8');
}

describe('W8 register page-state migration', () => {
    it.each([
        'src/pages/risks/useRisksPageState.ts',
        'src/pages/issues/useIssuesPageState.ts',
        'src/pages/vendors/useVendorsPageState.ts',
        'src/pages/kris/useKrisPageState.ts',
    ])('%s delegates collection state to useRegisterPageController', (relativePath) => {
        const source = readFrontendSource(relativePath);

        expect(source).toContain('useRegisterPageController');
        expect(source).not.toContain('useCollectionPageWorkflow');
        expect(source).not.toContain('useDebouncedValue');
        expect(source).not.toContain('getTotalPages');
        expect(source).not.toContain('resetCollectionGroupAndPage');
    });
});
