import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 2 exit criterion (audit 2026-09-30 §5.4, D7, D14, NAV-01, DS-15):
 * every routed page has exactly one `h1` and a translated `document.title`.
 *
 * Static contract over the route manifest:
 * 1. every lazily imported route page reaches a title source in its import
 *    graph: `PageHeader`, `EntityDetailHeader`, `RegisterListShell` (renders
 *    `PageHeader`), `EditBlockedState`, `AuthFrame` / `NativeFrame`, or a direct
 *    `usePageTitle(…)` call;
 * 2. a raw `<h1` exists only in the title primitives and the documented
 *    exceptions, so a page cannot add a second `h1` next to its header.
 */

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;
const srcRoot = path.join(repoRoot, 'frontend', 'src');

const ROUTING_FILES = ['core.tsx', 'business.tsx', 'admin.tsx', 'public.tsx'];
const LAZY_PAGE_RE = /lazy\(\(\) => import\('@\/(pages\/[^']+)'\)\)/g;
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+'([^']+)'|import\('([^']+)'\)/g;

/**
 * Not counted as the page's title source: the primitives themselves (matching
 * them inside their own definition would be circular) and the detail
 * load-failure fallback, which titles only the error state, not the page.
 */
const TITLE_PRIMITIVE_FILES = new Set([
    'components/layout/PageHeader.tsx',
    'pages/detail/EntityDetailHeader.tsx',
    'components/layout/AuthFrame.tsx',
    'hooks/usePageTitle.ts',
    'pages/detail/DetailLoadState.tsx',
]);
const TITLE_SOURCE_RE = /<PageHeader\b|<EntityDetailHeader\b|<AuthFrame\b|<NativeFrame\b|<EditBlockedState\b|\busePageTitle\(/;

/**
 * Files allowed to render a raw `<h1>`: the two header primitives, the public
 * frame (every login, callback, landing and preview surface renders its `h1`
 * through `AuthFrame` since Phase 3i), and page-level fallbacks that replace
 * the whole route.
 */
const H1_ALLOWLIST = new Set([
    'components/layout/PageHeader.tsx',
    'pages/detail/EntityDetailHeader.tsx',
    'components/layout/AuthFrame.tsx',
    'components/layout/DesktopOnlyNotice.tsx',
    'components/ErrorBoundary.tsx',
    'pages/NotFoundPage.tsx',
    'pages/detail/DetailLoadState.tsx',
]);

function relative(file: string): string {
    return path.relative(srcRoot, file).split(path.sep).join('/');
}

function resolveModule(specifier: string, fromFile: string): string | null {
    let base: string;
    if (specifier.startsWith('@/')) {
        base = path.join(srcRoot, specifier.slice(2));
    } else if (specifier.startsWith('.')) {
        base = path.resolve(path.dirname(fromFile), specifier);
    } else {
        return null;
    }
    const candidates = [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')];
    return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function routedPageFiles(): string[] {
    const pages = new Set<string>();
    for (const routingFile of ROUTING_FILES) {
        const source = readFileSync(path.join(srcRoot, 'routing', routingFile), 'utf8');
        for (const match of source.matchAll(LAZY_PAGE_RE)) {
            const resolved = resolveModule(`@/${match[1]}`, path.join(srcRoot, 'routing', routingFile));
            if (resolved) pages.add(resolved);
        }
    }
    return [...pages].sort();
}

/** The first file in the page's own import graph (pages + components) that renders a title source. */
function titleSourceOf(pageFile: string): string | null {
    const seen = new Set<string>();
    const queue = [pageFile];
    while (queue.length > 0) {
        const file = queue.shift()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const rel = relative(file);
        if (!rel.startsWith('pages/') && !rel.startsWith('components/')) continue;
        if (TITLE_PRIMITIVE_FILES.has(rel)) continue;
        const source = readFileSync(file, 'utf8');
        if (TITLE_SOURCE_RE.test(source)) return rel;
        for (const match of source.matchAll(IMPORT_RE)) {
            const resolved = resolveModule(match[1] ?? match[2], file);
            if (resolved && /\.(tsx?|ts)$/.test(resolved)) queue.push(resolved);
        }
    }
    return null;
}

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(full);
        return entry.name.endsWith('.tsx') ? [full] : [];
    });
}

describe('route page title contract (D7, D14, NAV-01)', () => {
    const pages = routedPageFiles();

    it('discovers the routed pages from the route manifest', () => {
        expect(pages.length).toBeGreaterThan(30);
        expect(pages.map(relative)).toEqual(expect.arrayContaining([
            'pages/DashboardPage.tsx',
            'pages/RisksPage.tsx',
            'pages/RiskDetailPage.tsx',
            'pages/ApprovalsPage.tsx',
            'pages/LoginPage.tsx',
        ]));
    });

    it.each(pages.map((file) => [relative(file), file]))(
        '%s renders a page title source (one h1 + translated document.title)',
        (_name, file) => {
            expect(titleSourceOf(file)).not.toBeNull();
        },
    );

    it('keeps raw <h1> elements inside the title primitives and documented exceptions', () => {
        const offenders = tsxFiles(srcRoot)
            .filter((file) => /<h1[\s>]/.test(readFileSync(file, 'utf8')))
            .map(relative)
            .filter((rel) => !H1_ALLOWLIST.has(rel));
        expect(offenders).toEqual([]);
    });
});
