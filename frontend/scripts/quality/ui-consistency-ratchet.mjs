#!/usr/bin/env node
/**
 * G-RATCHET (D15): UI-consistency regression ratchet.
 *
 * Counts design-system debt patterns per (pattern, file) across `src/**` and compares the
 * counts with the committed `ui-consistency-baseline.json`. Any increase fails; a file that
 * is new to the baseline fails as soon as it has a count above 0. Counts may only go down:
 * `--update-baseline` rewrites the baseline only when no count increased, unless `--force`
 * is passed (reserved for pure file moves/renames, which reviewers verify via the totals).
 *
 * ESLint suppressions and inline disables are forbidden in this repository (ADR-013), so the
 * ratchet is a standalone script rather than an eslint-suppressions baseline.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_VERSION = 1;
export const BASELINE_FILENAME = 'ui-consistency-baseline.json';
export const UPDATE_COMMAND = 'npm run quality:ui-ratchet -- --update-baseline';

const SOURCE_FILE_RE = /\.(?:ts|tsx)$/;
const CSS_FILE_RE = /\.css$/;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx)$/;
const TEST_PATH_RE = /(?:^|\/)(?:__tests__|test)\//;
const UI_PRIMITIVES_RE = /^src\/components\/ui\//;
// The sanctioned table primitives (§4.13, D14): `components/ui/**` and SortableTable itself.
const TABLE_PRIMITIVES_RE = /^src\/components\/(?:ui\/|tables\/SortableTable\.tsx$)/;
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

/**
 * Ratcheted patterns (audit 2026-09-30 §4.1 G-RATCHET table plus the D15 extras).
 * `kind: 'source'` scans src/**\/*.{ts,tsx}; `kind: 'css'` scans src/**\/*.css.
 * `exclude` skips the sanctioned primitive implementations for element bans.
 * `lineFilter` counts a match only on lines that also match the filter.
 */
export const PATTERNS = [
  {
    id: 'text-white',
    kind: 'source',
    regex: /(?<![\w-])(?:[a-z-]+:)*text-white(?![\w/-])/g,
    covers: 'DS-01',
  },
  {
    id: 'raw-palette',
    kind: 'source',
    regex: new RegExp(
      `(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|placeholder|decoration|accent|caret)-(?:${PALETTE})-\\d{2,3}\\b`,
      'g',
    ),
    covers: 'DS-03, DS-06',
  },
  {
    id: 'white-alpha',
    kind: 'source',
    regex: /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|to|via|fill|stroke)-(?:white|black)\/[\w.[\]]+/g,
    covers: 'DS-22',
  },
  { id: 'micro-font', kind: 'source', regex: /text-\[(?:[0-9]|10)(?:\.\d+)?px\]/g, covers: 'DS-14' },
  { id: 'font-black', kind: 'source', regex: /(?<![\w-])(?:[a-z-]+:)*font-black(?![\w-])/g, covers: 'DS-14 (D6)' },
  {
    id: 'arbitrary-color',
    kind: 'source',
    regex: /-\[[^\] "]*(?:#[0-9a-fA-F]{3}|rgba?\(|hsla?\()/g,
    covers: 'DS-24, PG-01',
  },
  { id: 'hex-literal', kind: 'source', regex: /['"`]#[0-9a-fA-F]{3,8}['"`]/g, covers: 'DS-05' },
  { id: 'text-accent-as-text', kind: 'source', regex: /\btext-accent(?![\w-])/g, covers: 'DS-19' },
  { id: 'dark-variant', kind: 'source', regex: /(?<![\w-])dark:(?=[!a-z[-])/g, covers: 'DS-20' },
  { id: 'inline-style', kind: 'source', regex: /\bstyle=\{/g, covers: 'PG-01' },
  { id: 'raw-button', kind: 'source', regex: /<button\b/g, exclude: UI_PRIMITIVES_RE, covers: 'DS-10' },
  {
    id: 'raw-text-input',
    kind: 'source',
    // The look-ahead stays inside the opening tag (an arrow `=>` is not its end) and accepts
    // `type="checkbox"` as well as `type={'checkbox'}`.
    regex: /<(?:textarea|input)\b(?!(?:=>|[^>])*\btype=\{?["'`](?:checkbox|radio|hidden|range|color|file)["'`])/g,
    exclude: UI_PRIMITIVES_RE,
    covers: 'DS-02',
  },
  { id: 'raw-table', kind: 'source', regex: /<table\b/g, exclude: TABLE_PRIMITIVES_RE, covers: 'DS-11' },
  { id: 'btn-classes', kind: 'source', regex: /\bbtn-(?:primary|secondary)\b/g, covers: 'DS-09, GAP-D-05' },
  { id: 'z-arbitrary', kind: 'source', regex: /\bz-\[\d+\]/g, covers: 'DS-27' },
  { id: 'radius-offscale', kind: 'source', regex: /\brounded-(?:3xl|\[)/g, covers: 'DS-25' },
  {
    id: 'pill-inline',
    kind: 'source',
    regex: /px-(?:1\.5|2|2\.5) py-(?:0\.5|1)\b/g,
    // `(?![\w-])`, not `\b`: a word boundary never follows the `]` of `text-[10px]`.
    lineFilter: /text-(?:\[(?:8|9|10|11)px\]|xs)(?![\w-])/,
    covers: 'DS-13',
  },
  {
    id: 'spinner-adhoc',
    kind: 'source',
    regex: /\banimate-spin\b|\bborder-t-transparent\b/g,
    exclude: UI_PRIMITIVES_RE,
    covers: 'DS-17',
  },
  { id: 'important-css', kind: 'css', regex: /!important\b/g, covers: 'DS-05' },
];

export function isScannedPath(relPath) {
  if (TEST_FILE_RE.test(relPath) || TEST_PATH_RE.test(relPath)) return false;
  return SOURCE_FILE_RE.test(relPath) || CSS_FILE_RE.test(relPath);
}

function appliesTo(pattern, relPath) {
  const isCss = CSS_FILE_RE.test(relPath);
  if (pattern.kind === 'css' ? !isCss : isCss) return false;
  return !(pattern.exclude && pattern.exclude.test(relPath));
}

function countRegex(text, regex) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return [...text.matchAll(new RegExp(regex.source, flags))].length;
}

/** Number of matches of one pattern in one file's source (0 when the pattern does not apply). */
export function countPattern(pattern, relPath, source) {
  if (!appliesTo(pattern, relPath)) return 0;
  if (!pattern.lineFilter) return countRegex(source, pattern.regex);
  return source
    .split('\n')
    .filter((line) => pattern.lineFilter.test(line))
    .reduce((sum, line) => sum + countRegex(line, pattern.regex), 0);
}

/**
 * Builds `{ [patternId]: { [relPath]: count } }` (zero counts omitted, keys sorted) from
 * an iterable of `{ path, source }` entries whose paths are relative to the frontend root.
 */
export function buildCounts(files, patterns = PATTERNS) {
  const counts = Object.fromEntries(patterns.map((pattern) => [pattern.id, {}]));
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const { path: relPath, source } of sortedFiles) {
    if (!isScannedPath(relPath)) continue;
    for (const pattern of patterns) {
      const count = countPattern(pattern, relPath, source);
      if (count > 0) counts[pattern.id][relPath] = count;
    }
  }
  return counts;
}

export function totalsOf(counts) {
  return Object.fromEntries(
    Object.entries(counts).map(([id, perFile]) => [id, Object.values(perFile).reduce((sum, n) => sum + n, 0)]),
  );
}

/**
 * Compares baseline counts with current counts.
 * - `increases`: (pattern, file) counts above baseline (a file absent from the baseline counts as 0).
 * - `decreases`: counts below baseline (including files that no longer exist or are clean).
 * - `unbaselined`: patterns that have no baseline entry yet (must be seeded with --update-baseline).
 * - `retired`: baseline patterns that are no longer ratcheted.
 */
export function compareCounts(baselineCounts, currentCounts) {
  const increases = [];
  const decreases = [];
  const unbaselined = [];
  const totals = {};

  for (const [patternId, current] of Object.entries(currentCounts)) {
    const baseline = baselineCounts[patternId];
    if (!baseline) {
      unbaselined.push(patternId);
      continue;
    }
    const files = new Set([...Object.keys(baseline), ...Object.keys(current)]);
    for (const file of [...files].sort()) {
      const before = baseline[file] ?? 0;
      const after = current[file] ?? 0;
      if (after > before) increases.push({ pattern: patternId, file, before, after });
      if (after < before) decreases.push({ pattern: patternId, file, before, after });
    }
    totals[patternId] = {
      before: Object.values(baseline).reduce((sum, n) => sum + n, 0),
      after: Object.values(current).reduce((sum, n) => sum + n, 0),
    };
  }

  const retired = Object.keys(baselineCounts).filter((id) => !(id in currentCounts));
  return { increases, decreases, unbaselined, retired, totals };
}

export function buildBaselineDocument(counts) {
  const sortedCounts = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((id) => [
        id,
        Object.fromEntries(Object.entries(counts[id]).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
  return {
    version: BASELINE_VERSION,
    description:
      'G-RATCHET baseline (docs/audits/2026-09-30-frontend-ui-consistency-audit.md §4.1). Counts may only go down; regenerate with `' +
      UPDATE_COMMAND +
      '`.',
    totals: totalsOf(sortedCounts),
    counts: sortedCounts,
  };
}

/**
 * Decides whether `--update-baseline` may rewrite the baseline. Increases are refused unless
 * `force` is set; new (unbaselined) patterns are seeded; retired patterns are dropped.
 */
export function planBaselineUpdate(baselineCounts, currentCounts, { force = false } = {}) {
  const comparison = compareCounts(baselineCounts, currentCounts);
  if (comparison.increases.length > 0 && !force) {
    return { ok: false, comparison, document: null };
  }
  return { ok: true, comparison, document: buildBaselineDocument(currentCounts) };
}

function formatDelta(before, after) {
  const delta = after - before;
  return `${before} -> ${after} (${delta > 0 ? '+' : ''}${delta})`;
}

/** Concise, human-readable diff lines for a comparison. */
export function formatComparison(comparison, { maxRows = 40 } = {}) {
  const lines = [];
  const section = (title, rows) => {
    if (rows.length === 0) return;
    lines.push(`${title} (${rows.length}):`);
    for (const row of rows.slice(0, maxRows)) {
      lines.push(`  ${row.pattern.padEnd(20)} ${row.file}  ${formatDelta(row.before, row.after)}`);
    }
    if (rows.length > maxRows) lines.push(`  ... plus ${rows.length - maxRows} more`);
  };
  section('Increases', comparison.increases);
  section('Decreases', comparison.decreases);

  const changedTotals = Object.entries(comparison.totals).filter(([, t]) => t.before !== t.after);
  if (changedTotals.length > 0) {
    lines.push('Pattern totals:');
    for (const [id, t] of changedTotals) {
      lines.push(`  ${id.padEnd(20)} ${formatDelta(t.before, t.after)}`);
    }
  }
  if (comparison.unbaselined.length > 0) {
    lines.push(`Patterns without a baseline: ${comparison.unbaselined.join(', ')}`);
  }
  if (comparison.retired.length > 0) {
    lines.push(`Baseline patterns no longer ratcheted: ${comparison.retired.join(', ')}`);
  }
  return lines;
}

function collectFiles(frontendRoot) {
  const srcRoot = join(frontendRoot, 'src');
  const files = [];
  const walk = (absDir, relDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const relPath = `${relDir}/${entry.name}`;
      const absPath = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile() && isScannedPath(relPath)) {
        files.push({ path: relPath, source: readFileSync(absPath, 'utf8') });
      }
    }
  };
  walk(srcRoot, 'src');
  return files;
}

function parseArgs(argv) {
  const rootArg = argv.find((arg) => arg.startsWith('--root='));
  return {
    update: argv.includes('--update-baseline'),
    force: argv.includes('--force'),
    root: rootArg ? rootArg.slice('--root='.length) : null,
  };
}

function resolveFrontendRoot(rootArg) {
  if (rootArg) return resolve(process.cwd(), rootArg);
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) return null;
  const parsed = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (parsed.version !== BASELINE_VERSION || typeof parsed.counts !== 'object' || parsed.counts === null) {
    throw new Error(`${BASELINE_FILENAME} has an unsupported shape (expected version ${BASELINE_VERSION} with counts)`);
  }
  return parsed.counts;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const frontendRoot = resolveFrontendRoot(args.root);
  const baselinePath = join(frontendRoot, 'scripts', 'quality', BASELINE_FILENAME);
  const files = collectFiles(frontendRoot);
  const currentCounts = buildCounts(files);
  const baselineCounts = loadBaseline(baselinePath);

  if (args.update) {
    const plan = planBaselineUpdate(baselineCounts ?? {}, currentCounts, { force: args.force });
    for (const line of formatComparison(plan.comparison)) console.log(line);
    if (!plan.ok) {
      console.error(
        'UI consistency ratchet: refusing to raise the baseline. Fix the increases above, or pass --force only for pure file moves/renames.',
      );
      return 1;
    }
    writeFileSync(baselinePath, `${JSON.stringify(plan.document, null, 2)}\n`, 'utf8');
    console.log(`UI consistency ratchet: baseline written (${files.length} files scanned).`);
    return 0;
  }

  if (!baselineCounts) {
    console.error(`UI consistency ratchet: missing ${BASELINE_FILENAME}. Seed it with \`${UPDATE_COMMAND}\`.`);
    return 1;
  }

  const comparison = compareCounts(baselineCounts, currentCounts);
  const failed = comparison.increases.length > 0 || comparison.unbaselined.length > 0;
  const report = formatComparison(comparison);
  const total = Object.values(totalsOf(currentCounts)).reduce((sum, n) => sum + n, 0);

  if (failed) {
    console.error(`UI consistency ratchet: FAIL (${files.length} files, ${PATTERNS.length} patterns)`);
    for (const line of report) console.error(line);
    console.error(
      'Counts may only go down (audit §4.1 G-RATCHET). Use design-system tokens/primitives instead of the flagged pattern.',
    );
    return 1;
  }

  console.log(
    `UI consistency ratchet: PASS (${files.length} files, ${PATTERNS.length} patterns, ${total} ratcheted matches)`,
  );
  for (const line of report) console.log(line);
  if (comparison.decreases.length > 0 || comparison.retired.length > 0) {
    console.log(`Lock in the lower counts with \`${UPDATE_COMMAND}\`.`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error('ui-consistency-ratchet failed:', error);
    process.exitCode = 1;
  }
}
