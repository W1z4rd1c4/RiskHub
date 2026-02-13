import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'i18n-audit');

const EXCLUDE_PATTERNS = [
  /\.test\.(ts|tsx)$/,
  /\/__tests__\//,
  /\/test\//,
  /\.d\.ts$/,
  /\/i18n\//,
];

function shouldExclude(file) {
  return EXCLUDE_PATTERNS.some((p) => p.test(file));
}

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, acc);
    } else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) {
      const rel = path.relative(ROOT, full).replaceAll('\\', '/');
      if (!shouldExclude(rel)) acc.push(rel);
    }
  }
  return acc;
}

function classify(file) {
  if (file.includes('/pages/')) return 'page';
  if (file.includes('/components/')) return 'component';
  if (file.includes('/constants/')) return 'constant';
  if (file.includes('/hooks/')) return 'hook';
  return 'other';
}

function isNoiseText(value) {
  const v = value.trim();
  if (!v) return true;
  if (v.startsWith('{') || v.startsWith('/*') || v.startsWith('//') || v.startsWith('<')) return true;
  if (/^[\W\d_]+$/u.test(v)) return true;
  if (/^\w+\.\w+(\.\w+)*$/.test(v)) return true;
  if (/^\/[a-z0-9/_-]*$/i.test(v)) return true;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return true;
  if (/^[A-Z0-9_:-]{2,}$/.test(v)) return true;
  if (!/\s/.test(v) && v.length < 10) return true;
  if (!/\s/.test(v) && /^[a-z0-9_\-[\]:]+$/i.test(v)) return true;
  if (/^(create\s+"?|[(×•]+[a-z]*:?|[a-z]*:?|no|found)$/i.test(v)) return true;
  if (/^\(id:\s*$/i.test(v)) return true;
  if (/^\(p:\s*$/i.test(v)) return true;
  if (/^×\s*i:\s*$/i.test(v)) return true;
  if (/^\)\s*$/.test(v)) return true;
  if (!/[A-Za-z\u00C0-\u024F]/u.test(v)) return true;
  return false;
}

function getTextFromLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function countHardcoded(content, file) {
  const UI_ATTRS = new Set(['label', 'placeholder', 'title', 'aria-label', 'aria-placeholder', 'alt']);
  const UI_OBJECT_KEYS = new Set([
    'label',
    'title',
    'subtitle',
    'placeholder',
    'text',
    'empty',
    'emptyText',
    'helperText',
    'description',
    'caption',
    'tooltip',
  ]);

  const sf = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits = new Set();

  const addHit = (value, start) => {
    const txt = value.replace(/\s+/g, ' ').trim();
    if (!txt || isNoiseText(txt)) return;
    hits.add(`${start}:${txt}`);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) addHit(node.text || '', node.getStart(sf));

    if (ts.isJsxAttribute(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : node.name.text;
      if (UI_ATTRS.has(name)) {
        const init = node.initializer;
        if (init && ts.isStringLiteral(init)) addHit(init.text, init.getStart(sf));
        if (
          init &&
          ts.isJsxExpression(init) &&
          init.expression &&
          (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))
        ) {
          addHit(init.expression.text, init.expression.getStart(sf));
        }
      }
    }

    if (ts.isPropertyAssignment(node) && !node.questionToken) {
      const key = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : null;
      if (key && UI_OBJECT_KEYS.has(key)) {
        const lit = getTextFromLiteral(node.initializer);
        if (lit !== null) addHit(lit, node.initializer.getStart(sf));
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (parent && ts.isJsxExpression(parent)) {
        const container = parent.parent;
        if (container && (ts.isJsxElement(container) || ts.isJsxFragment(container))) {
          addHit(node.text, node.getStart(sf));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return hits.size;
}

function riskFor(file) {
  if (file === 'src/App.tsx' || file.includes('/pages/') || file.includes('/components/')) {
    return 'high';
  }
  if (file.includes('/constants/') || file.includes('/hooks/')) {
    return 'medium';
  }
  return 'low';
}

async function main() {
  const files = await walk(SRC_DIR);
  const rows = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(ROOT, file), 'utf8');
    rows.push({
      file,
      hardcodedTextCount: countHardcoded(content, file),
      usesTranslation: /useTranslation\s*\(/.test(content),
      ownershipGroup: classify(file),
      severity: riskFor(file),
    });
  }

  rows.sort((a, b) => b.hardcodedTextCount - a.hardcodedTextCount || a.file.localeCompare(b.file));

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, 'inventory.json'), JSON.stringify(rows, null, 2) + '\n', 'utf8');

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const row of rows) bySeverity[row.severity] += row.hardcodedTextCount;

  const lines = [
    '# i18n UI Text Inventory',
    '',
    `- Files scanned: ${rows.length}`,
    `- Hardcoded count (high): ${bySeverity.high}`,
    `- Hardcoded count (medium): ${bySeverity.medium}`,
    `- Hardcoded count (low): ${bySeverity.low}`,
    '',
    '| File | Hardcoded Count | useTranslation | Group | Severity |',
    '|---|---:|:---:|---|---|',
  ];

  for (const row of rows) {
    lines.push(`| \`${row.file}\` | ${row.hardcodedTextCount} | ${row.usesTranslation ? 'yes' : 'no'} | ${row.ownershipGroup} | ${row.severity} |`);
  }

  await fs.writeFile(path.join(OUT_DIR, 'inventory.md'), lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote i18n audit inventory for ${rows.length} files.`);
}

main().catch((err) => {
  console.error('inventory-ui-text failed:', err);
  process.exit(1);
});
