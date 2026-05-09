import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MAX_INLINE_QUERY_KEYS = 0;

const REPO_ROOT = path.resolve(__dirname, '../../../../../../../');
const SRC_ROOT = path.join(REPO_ROOT, 'frontend/src');
const FACTORY_DIR = path.join(SRC_ROOT, 'lib', 'queryKeys');

function* walk(dir: string): IterableIterator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
            yield full;
        }
    }
}

function inlineQueryKeySites(): string[] {
    const sites: string[] = [];
    for (const file of walk(SRC_ROOT)) {
        if (file.startsWith(FACTORY_DIR)) continue;
        const src = fs.readFileSync(file, 'utf8');
        const matches = src.match(/queryKey:\s*\[/g) ?? [];
        for (let index = 0; index < matches.length; index += 1) {
            sites.push(path.relative(REPO_ROOT, file));
        }
    }
    return sites;
}

describe('inline queryKey budget (#46)', () => {
    it('keeps all frontend query keys behind factory functions', () => {
        const sites = inlineQueryKeySites();
        expect(sites, sites.join('\n')).toHaveLength(MAX_INLINE_QUERY_KEYS);
    });
});
