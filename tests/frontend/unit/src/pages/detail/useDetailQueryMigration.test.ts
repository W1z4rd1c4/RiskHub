import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;

function frontendPath(relativePath: string): string {
    return path.join(repoRoot, 'frontend', relativePath);
}

function readFrontendSource(relativePath: string): string {
    return readFileSync(frontendPath(relativePath), 'utf8');
}

describe('W8 detail-fetch React Query migration', () => {
    it('keeps audited detail hooks off the retired useDetailResource hook', () => {
        expect(existsSync(frontendPath('src/pages/detail/useDetailResource.ts'))).toBe(false);

        for (const relativePath of [
            'src/pages/detail/useRiskDetailState.ts',
            'src/pages/ControlDetailPage.tsx',
            'src/pages/detail/useKriDetailState.ts',
            'src/pages/vendors/useVendorDetailState.ts',
        ]) {
            const source = readFrontendSource(relativePath);
            expect(source).toContain('useDetailQuery');
            expect(source).not.toContain('useDetailResource');
        }
    });

    it('keeps issue query keys under the shared queryKeys directory with the documented stale-time constant', () => {
        expect(existsSync(frontendPath('src/lib/issueQueryKeys.ts'))).toBe(false);
        expect(readFrontendSource('src/pages/issues/issue-detail/useIssueDetail.ts')).toContain(
            'DETAIL_QUERY_STALE_TIME_MS'
        );
        expect(readFrontendSource('src/lib/queryKeys/detail.ts')).toContain('DETAIL_QUERY_STALE_TIME_MS = 30_000');
    });
});
