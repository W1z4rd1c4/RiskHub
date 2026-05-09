import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../../');
const duplicateBannerImport = 'Kri' + 'ApprovalQueuedBanner';

describe('S6.4: KriApprovalQueuedBanner deletion', () => {
    it('KriApprovalQueuedBanner.tsx file removed', () => {
        const path = resolve(repoRoot, 'frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx');
        expect(existsSync(path)).toBe(false);
    });

    it('frontend source does not import the KRI-specific banner', () => {
        const offenders: string[] = [];
        const srcRoot = resolve(repoRoot, 'frontend/src');
        const visit = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const path = resolve(dir, entry.name);
                if (entry.isDirectory()) {
                    visit(path);
                    continue;
                }
                if (!path.endsWith('.ts') && !path.endsWith('.tsx')) {
                    continue;
                }
                if (readFileSync(path, 'utf8').includes(duplicateBannerImport)) {
                    offenders.push(path.replace(`${repoRoot}/`, ''));
                }
            }
        };

        visit(srcRoot);

        expect(offenders).toEqual([]);
    });
});
