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
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    while (true) {
      const m = re.exec(content);
      if (!m) break;
      matches.push(m[1]);
    }
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

function extractPageExports(content) {
  const exports = [];
  const re = /export\s+\{([^}]+)\}\s+from\s+['"](\.\/[^'"]+)['"]/g;
  while (true) {
    const match = re.exec(content);
    if (!match) break;
    const names = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    for (const rawName of names) {
      const aliasMatch = rawName.match(/^(.+?)\s+as\s+(.+)$/);
      const exportedName = aliasMatch ? aliasMatch[2].trim() : rawName.trim();
      exports.push({ name: exportedName, specifier: match[2] });
    }
  }
  return exports;
}

function extractPagesBarrelImports(content) {
  const imported = new Set();
  const re = /import\s*\{\s*([^}]*)\s*\}\s*from\s*['"]@\/pages['"]/g;
  while (true) {
    const match = re.exec(content);
    if (!match) break;
    const parts = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const aliasMatch = part.match(/^(.+?)\s+as\s+.+$/);
      imported.add((aliasMatch ? aliasMatch[1] : part).trim());
    }
  }
  return imported;
}

function extractDirectPageImports(content) {
  const importedModules = new Set();
  const re = /import\s+[^;]+?\s+from\s*['"](?:@\/pages|\.\/pages)\/([^'"]+)['"]/g;
  while (true) {
    const match = re.exec(content);
    if (!match) break;
    importedModules.add(match[1].replace(/\.(ts|tsx)$/, ''));
  }
  return importedModules;
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

  const pagesIndexPath = path.join(SRC_DIR, 'pages', 'index.ts');
  const appPath = path.join(SRC_DIR, 'App.tsx');
  const [pagesIndexContent, appContent] = await Promise.all([
    fs.readFile(pagesIndexPath, 'utf8').catch(() => ''),
    fs.readFile(appPath, 'utf8').catch(() => ''),
  ]);
  const exportedPages = extractPageExports(pagesIndexContent);
  const routedImports = extractPagesBarrelImports(appContent);
  const directPageImports = extractDirectPageImports(appContent);
  const dormantPages = exportedPages.filter((entry) => {
    const moduleName = entry.specifier.replace('./', '');
    return !routedImports.has(entry.name) && !directPageImports.has(moduleName);
  });

  const dormantLines = [
    '# Frontend Dormant Page Audit',
    '',
    `- Source barrel: \`src/pages/index.ts\``,
    `- Route import source: \`src/App.tsx\``,
    `- Dormant page exports: ${dormantPages.length}`,
    '',
    '| Page Module | Reason |',
    '|---|---|',
  ];
  for (const entry of dormantPages) {
    dormantLines.push(`| \`src/pages/${entry.specifier.replace('./', '')}.tsx\` | Exported as \`${entry.name}\` but not imported into App routes. |`);
  }
  await fs.writeFile(path.join(OUT_DIR, 'dormant.md'), `${dormantLines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${records.length} unreachable module records.`);
}

main().catch((err) => {
  console.error('find-unreachable-modules failed:', err);
  process.exit(1);
});
