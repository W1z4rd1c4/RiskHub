import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const forbiddenTokenBridge = '__RISKHUB_ACCESS_TOKEN__';

async function resolveFrontendSrcRoot(): Promise<string> {
    const candidates = [
        path.resolve(process.cwd(), 'src'),
        path.resolve(process.cwd(), '../frontend/src'),
        path.resolve(process.cwd(), '../../../frontend/src'),
    ];

    for (const candidate of candidates) {
        try {
            const details = await stat(candidate);
            if (details.isDirectory()) {
                return candidate;
            }
        } catch {
            // Try the next candidate.
        }
    }

    throw new Error(`Unable to resolve frontend/src from cwd ${process.cwd()}`);
}

async function collectFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            return collectFiles(entryPath);
        }
        return [entryPath];
    }));
    return files.flat();
}

describe('token exposure regression guard', () => {
    it('does not reintroduce the legacy browser-global token bridge in frontend/src', async () => {
        const frontendSrcRoot = await resolveFrontendSrcRoot();
        const files = await collectFiles(frontendSrcRoot);
        const offenders: string[] = [];

        await Promise.all(files.map(async (filePath) => {
            const contents = await readFile(filePath, 'utf8');
            if (contents.includes(forbiddenTokenBridge)) {
                offenders.push(path.relative(frontendSrcRoot, filePath));
            }
        }));

        expect(offenders).toEqual([]);
    });
});
