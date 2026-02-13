import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'cleanup-audit');

const SOURCE_EXTS = new Set(['.ts', '.tsx']);
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
const TEST_PATH_RE = /(?:^|\/)(__tests__|test)\//;

function isSourceFile(file) {
  const ext = path.extname(file);
  return SOURCE_EXTS.has(ext) && !file.endsWith('.d.ts');
}

function isTestPath(file) {
  return TEST_FILE_RE.test(file) || TEST_PATH_RE.test(file);
}

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isSourceFile(full)) continue;
    acc.push(full);
  }
  return acc;
}

function resolveImport(fromFile, specifier, fileSet) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;

  const base = specifier.startsWith('./') || specifier.startsWith('../')
    ? path.resolve(path.dirname(fromFile), specifier)
    : path.resolve(SRC_DIR, specifier.slice(2));

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    if (fileSet.has(path.normalize(candidate))) return path.normalize(candidate);
  }
  return null;
}

function extractSpecifiers(content) {
  const matches = [];
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(content))) matches.push(m[1]);
  }
  return matches;
}

function classify(file, refs) {
  if (refs.length === 0) return 'no-ref';
  if (refs.every((ref) => isTestPath(ref.relativeReferrer))) return 'test-only';
  return 'runtime-unreachable';
}

function reasonFor(classification) {
  if (classification === 'no-ref') return 'No imports/exports reference this module.';
  if (classification === 'test-only') return 'Referenced only from test files.';
  return 'Referenced by non-test modules, but unreachable from runtime entrypoint.';
}

function toRelative(absPath) {
  return path.relative(ROOT, absPath).replaceAll(path.sep, '/');
}

async function main() {
  const filesAbs = await walk(SRC_DIR);
  const files = filesAbs.map((p) => path.normalize(p));
  const fileSet = new Set(files);

  const refsByTarget = new Map(files.map((f) => [f, []]));
  const edges = new Map(files.map((f) => [f, []]));

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const imports = extractSpecifiers(content);
    for (const specifier of imports) {
      const resolved = resolveImport(file, specifier, fileSet);
      if (!resolved) continue;
      edges.get(file).push(resolved);
      refsByTarget.get(resolved).push({
        relativeReferrer: toRelative(file),
        specifier,
      });
    }
  }

  const entry = path.normalize(path.join(SRC_DIR, 'main.tsx'));
  const reachable = new Set();
  const queue = [];
  if (fileSet.has(entry)) {
    queue.push(entry);
    reachable.add(entry);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    for (const dep of edges.get(current) || []) {
      if (!reachable.has(dep)) {
        reachable.add(dep);
        queue.push(dep);
      }
    }
  }

  const unreachable = files.filter((file) => !reachable.has(file));
  const records = unreachable
    .map((file) => {
      const refs = refsByTarget.get(file) || [];
      const classification = classify(file, refs);
      return {
        file: toRelative(file),
        classification,
        reason: reasonFor(classification),
        refs,
      };
    })
    .filter((record) => !isTestPath(record.file))
    .sort((a, b) => a.file.localeCompare(b.file));

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, 'unreachable.json'), `${JSON.stringify(records, null, 2)}\n`, 'utf8');

  const lines = [
    '# Frontend Unreachable Module Audit',
    '',
    `- Entry: \`src/main.tsx\``,
    `- Candidates: ${records.length}`,
    '',
    '| File | Classification | Reason | Refs |',
    '|---|---|---|---|',
  ];

  for (const record of records) {
    const refText = record.refs.length === 0
      ? 'none'
      : record.refs.map((ref) => `\`${ref.relativeReferrer}\``).join(', ');
    lines.push(`| \`${record.file}\` | ${record.classification} | ${record.reason} | ${refText} |`);
  }

  await fs.writeFile(path.join(OUT_DIR, 'unreachable.md'), `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${records.length} unreachable module records.`);
}

main().catch((err) => {
  console.error('find-unreachable-modules failed:', err);
  process.exit(1);
});
