import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ARGS = process.argv.slice(2);
const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const DEFAULT_OUT_DIR = path.join(ROOT, '..', 'tests', 'results', 'frontend', 'audits', 'cleanup');
const RUNTIME_ENTRYPOINTS = ['main.tsx', 'prod-login-preview.tsx'];

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
    acc.push(path.normalize(full));
  }
  return acc;
}

function toRelative(absPath) {
  return path.relative(ROOT, absPath).replaceAll(path.sep, '/');
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
    const normalized = path.normalize(candidate);
    if (fileSet.has(normalized)) return normalized;
  }
  return null;
}

function parseModule(file, content) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);

  const imports = [];
  const namedReExports = [];
  const exportAllSpecs = [];

  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      const namedImports = [];
      let hasDefaultImport = false;
      let hasNamespaceImport = false;

      if (clause) {
        hasDefaultImport = Boolean(clause.name);
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            hasNamespaceImport = true;
          } else if (ts.isNamedImports(clause.namedBindings)) {
            for (const element of clause.namedBindings.elements) {
              const imported = element.propertyName ? element.propertyName.text : element.name.text;
              namedImports.push(imported);
            }
          }
        }
      }

      imports.push({ specifier, namedImports, hasDefaultImport, hasNamespaceImport });
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (!statement.exportClause) {
        exportAllSpecs.push(specifier);
        continue;
      }
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const imported = element.propertyName ? element.propertyName.text : element.name.text;
          const exported = element.name.text;
          namedReExports.push({ specifier, imported, exported });
        }
      }
    }
  }

  const dynamicImportSpecifiers = [];
  const collectDynamicImports = (node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImportSpecifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, collectDynamicImports);
  };
  collectDynamicImports(sf);
  for (const specifier of dynamicImportSpecifiers) {
    imports.push({
      specifier,
      namedImports: [],
      hasDefaultImport: false,
      hasNamespaceImport: false,
    });
  }

  return { imports, namedReExports, exportAllSpecs };
}

function buildBarrelNamedMap(barrelFile, fileSet, moduleInfoCache) {
  const info = moduleInfoCache.get(barrelFile);
  if (!info || info.namedReExports.length === 0) return new Map();

  const map = new Map();
  for (const entry of info.namedReExports) {
    const target = resolveImport(barrelFile, entry.specifier, fileSet);
    if (!target) continue;
    map.set(entry.exported, target);
  }
  return map;
}

function isLikelyBarrel(file, moduleInfoCache) {
  const base = path.basename(file);
  const info = moduleInfoCache.get(file);
  return base === 'index.ts' || base === 'index.tsx' || Boolean(info?.namedReExports.length);
}

function classify(file, refs) {
  if (refs.length === 0) return 'no-ref';
  if (refs.every((ref) => isTestPath(ref.relativeReferrer))) return 'test-only';
  return 'runtime-unreachable';
}

function reasonFor(classification, confidenceTag) {
  if (confidenceTag === 'dormant-routed') {
    return 'Page is exported from barrel but not imported into App route graph.';
  }
  if (classification === 'no-ref') return 'No imports/exports reference this module.';
  if (classification === 'test-only') return 'Referenced only from test files.';
  return 'Referenced by non-test modules, but unreachable from runtime entrypoint.';
}

function extractPageExports(content) {
  const exports = [];
  const sf = ts.createSourceFile('pages/index.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sf.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    const specifier = statement.moduleSpecifier.text;
    for (const element of statement.exportClause.elements) {
      exports.push({
        name: element.name.text,
        specifier,
      });
    }
  }

  return exports;
}

function extractPagesBarrelImports(content) {
  const imported = new Set();
  const sf = ts.createSourceFile('App.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== '@/pages') continue;

    const clause = statement.importClause;
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;

    for (const element of clause.namedBindings.elements) {
      const importedName = element.propertyName ? element.propertyName.text : element.name.text;
      imported.add(importedName);
    }
  }

  return imported;
}

function extractDirectPageImports(content) {
  const importedModules = new Set();
  const sf = ts.createSourceFile('App.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('@/pages/') && !specifier.startsWith('./pages/')) continue;

    const moduleName = specifier
      .replace(/^@\/pages\//, '')
      .replace(/^\.\/pages\//, '')
      .replace(/\.(ts|tsx)$/, '');

    importedModules.add(moduleName);
  }

  const collectDynamicImports = (node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      const specifier = node.arguments[0].text;
      if (!specifier.startsWith('@/pages/') && !specifier.startsWith('./pages/')) return;
      const moduleName = specifier
        .replace(/^@\/pages\//, '')
        .replace(/^\.\/pages\//, '')
        .replace(/\.(ts|tsx)$/, '');
      importedModules.add(moduleName);
    }
    ts.forEachChild(node, collectDynamicImports);
  };
  collectDynamicImports(sf);

  return importedModules;
}

function resolveOutputDir() {
  const flag = ARGS.find((arg) => arg === '--output-dir' || arg.startsWith('--output-dir='));
  if (!flag) return DEFAULT_OUT_DIR;
  if (flag === '--output-dir') {
    const nextArg = ARGS[ARGS.indexOf(flag) + 1];
    if (!nextArg || nextArg.startsWith('--')) {
      throw new Error('Missing value for --output-dir');
    }
    return path.isAbsolute(nextArg) ? nextArg : path.resolve(ROOT, nextArg);
  }
  const [, rawPath] = flag.split('=');
  if (!rawPath) {
    throw new Error('Missing value for --output-dir');
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(ROOT, rawPath);
}

async function main() {
  const outDir = resolveOutputDir();
  const files = await walk(SRC_DIR);
  const fileSet = new Set(files);

  const moduleInfoCache = new Map();
  const fileContents = new Map();

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    fileContents.set(file, content);
    moduleInfoCache.set(file, parseModule(file, content));
  }

  const refsByTarget = new Map(files.map((f) => [f, []]));
  const edges = new Map(files.map((f) => [f, new Set()]));

  const addEdge = (fromFile, toFile, specifier) => {
    edges.get(fromFile).add(toFile);
    refsByTarget.get(toFile).push({
      relativeReferrer: toRelative(fromFile),
      specifier,
    });
  };

  for (const file of files) {
    const info = moduleInfoCache.get(file);
    for (const imp of info.imports) {
      const resolved = resolveImport(file, imp.specifier, fileSet);
      if (!resolved) continue;

      // Preserve runtime reachability for the import source itself.
      addEdge(file, resolved, imp.specifier);

      if (imp.namedImports.length > 0 && isLikelyBarrel(resolved, moduleInfoCache)) {
        const namedMap = buildBarrelNamedMap(resolved, fileSet, moduleInfoCache);
        for (const importedName of imp.namedImports) {
          const target = namedMap.get(importedName);
          if (!target) continue;
          addEdge(file, target, `${imp.specifier}#${importedName}`);
        }
      }
    }

    for (const reExport of info.namedReExports) {
      const resolved = resolveImport(file, reExport.specifier, fileSet);
      if (!resolved) continue;
      addEdge(file, resolved, `${reExport.specifier}#${reExport.imported}`);
    }

    for (const exportAllSpec of info.exportAllSpecs) {
      const resolved = resolveImport(file, exportAllSpec, fileSet);
      if (!resolved) continue;
      addEdge(file, resolved, `${exportAllSpec}#*`);
    }
  }

  const reachable = new Set();
  const queue = [];

  for (const entryName of RUNTIME_ENTRYPOINTS) {
    const entry = path.normalize(path.join(SRC_DIR, entryName));
    if (!fileSet.has(entry)) continue;
    if (reachable.has(entry)) continue;
    reachable.add(entry);
    queue.push(entry);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    for (const dep of edges.get(current) || []) {
      if (reachable.has(dep)) continue;
      reachable.add(dep);
      queue.push(dep);
    }
  }

  const pagesIndexPath = path.join(SRC_DIR, 'pages', 'index.ts');
  const appPath = path.join(SRC_DIR, 'App.tsx');
  const pagesIndexContent = fileContents.get(path.normalize(pagesIndexPath)) || '';
  const appContent = fileContents.get(path.normalize(appPath)) || '';

  const exportedPages = extractPageExports(pagesIndexContent);
  const routedImports = extractPagesBarrelImports(appContent);
  const directPageImports = extractDirectPageImports(appContent);

  const dormantPages = exportedPages.filter((entryInfo) => {
    const moduleName = entryInfo.specifier.replace('./', '');
    return !routedImports.has(entryInfo.name) && !directPageImports.has(moduleName);
  });

  const dormantFileSet = new Set(
    dormantPages.map((entryInfo) => `src/pages/${entryInfo.specifier.replace('./', '')}.tsx`),
  );

  const unreachable = files.filter((file) => !reachable.has(file));

  const records = unreachable
    .map((file) => {
      const refs = refsByTarget.get(file) || [];
      const rel = toRelative(file);
      const classification = classify(rel, refs);
      const confidenceTag = dormantFileSet.has(rel)
        ? 'dormant-routed'
        : refs.length === 0
          ? 'proven-unused'
          : 'indirectly-reachable';

      return {
        file: rel,
        classification,
        confidence_tag: confidenceTag,
        reason: reasonFor(classification, confidenceTag),
        refs,
      };
    })
    .filter((record) => !isTestPath(record.file))
    .sort((a, b) => a.file.localeCompare(b.file));

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'unreachable.json'), `${JSON.stringify(records, null, 2)}\n`, 'utf8');

  const lines = [
    '# Frontend Unreachable Module Audit',
    '',
    `- Entrypoints: ${RUNTIME_ENTRYPOINTS.map((entryName) => `\`src/${entryName}\``).join(', ')}`,
    `- Candidates: ${records.length}`,
    '',
    '| File | Classification | Confidence Tag | Reason | Refs |',
    '|---|---|---|---|---|',
  ];

  for (const record of records) {
    const refText = record.refs.length === 0
      ? 'none'
      : record.refs.map((ref) => `\`${ref.relativeReferrer}\``).join(', ');
    lines.push(`| \`${record.file}\` | ${record.classification} | ${record.confidence_tag} | ${record.reason} | ${refText} |`);
  }

  await fs.writeFile(path.join(outDir, 'unreachable.md'), `${lines.join('\n')}\n`, 'utf8');

  const dormantLines = [
    '# Frontend Dormant Page Audit',
    '',
    '- Source barrel: `src/pages/index.ts`',
    '- Route import source: `src/App.tsx`',
    `- Dormant page exports: ${dormantPages.length}`,
    '',
    '| Page Module | Reason |',
    '|---|---|',
  ];

  for (const entryInfo of dormantPages) {
    dormantLines.push(`| \`src/pages/${entryInfo.specifier.replace('./', '')}.tsx\` | Exported as \`${entryInfo.name}\` but not imported into App routes. |`);
  }

  await fs.writeFile(path.join(outDir, 'dormant.md'), `${dormantLines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${records.length} unreachable module records.`);
}

main().catch((err) => {
  console.error('find-unreachable-modules failed:', err);
  process.exit(1);
});
