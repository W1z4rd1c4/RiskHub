import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;

function readFrontendSource(relativePath: string): string {
    return readFileSync(path.join(repoRoot, 'frontend', relativePath), 'utf8');
}

describe('W3 verified frontend dead-code deletion', () => {
    it('keeps the retired layout Header component deleted', () => {
        expect(existsSync(path.join(repoRoot, 'frontend/src/components/layout/Header.tsx'))).toBe(false);
        expect(readFrontendSource('src/components/layout/index.ts')).not.toContain("from './Header'");
    });

    it('keeps dead access user action helpers deleted while preserving badge presentation', () => {
        const source = readFrontendSource('src/components/access/usersTablePresentation.ts');

        expect(source).not.toContain('canChangeUserActiveStatus');
        expect(source).not.toContain('canBreakGlassEnableUser');
        expect(source).not.toContain('canEditAccessUser');
        expect(source).toContain('userScopeBadgeClassName');
    });

    it('keeps ApprovalList capability gating backend-driven without current user id props', () => {
        expect(readFrontendSource('src/pages/ApprovalsPage.tsx')).not.toContain('currentUserId=');

        const approvalListSource = readFrontendSource('src/pages/approvals/ApprovalList.tsx');
        expect(approvalListSource).not.toContain('currentUserId');
        expect(approvalListSource).toContain('resolveCapabilityFlag');
    });
});
