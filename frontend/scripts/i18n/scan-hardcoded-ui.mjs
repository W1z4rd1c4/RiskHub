import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts', 'i18n', 'allowlist.json');

const DEFAULT_EXCLUDE = [
  /\.test\.(ts|tsx)$/,
  /\/__tests__\//,
  /\/test\//,
  /\.d\.ts$/,
  /\/i18n\/locales\//,
];

function globLikeToRegex(glob) {
  const escaped = glob
    .replaceAll('.', '\\.')
    .replaceAll('**/', '(?:.*/)?')
    .replaceAll('**', '.*')
    .replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function toLineCol(content, index) {
  const chunk = content.slice(0, index);
  const lines = chunk.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
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

function matchesAnyPattern(text, regexes) {
  return regexes.some((r) => r.test(text));
}

function getTextFromLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function isTranslationCall(node) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent) || parent.arguments[0] !== node) return false;

  const expr = parent.expression;
  if (ts.isIdentifier(expr) && expr.text === 't') return true;
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 't') return true;
  return false;
}

function getPropName(attrName) {
  return ts.isIdentifier(attrName) ? attrName.text : attrName.text;
}

function getStringFromInitializer(initializer) {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))
  ) {
    return initializer.expression.text;
  }
  return null;
}

function collectUiExpressionLiterals(expr, acc = []) {
  if (!expr) return acc;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    acc.push(expr);
    return acc;
  }

  if (ts.isParenthesizedExpression(expr)) {
    collectUiExpressionLiterals(expr.expression, acc);
    return acc;
  }

  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    collectUiExpressionLiterals(expr.right, acc);
    return acc;
  }

  if (ts.isConditionalExpression(expr)) {
    collectUiExpressionLiterals(expr.whenTrue, acc);
    collectUiExpressionLiterals(expr.whenFalse, acc);
    return acc;
  }

  return acc;
}

function normalizeUiText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, acc);
      continue;
    }
    if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
    const rel = path.relative(ROOT, full).replaceAll('\\', '/');
    if (DEFAULT_EXCLUDE.some((p) => p.test(rel))) continue;
    acc.push(rel);
  }
  return acc;
}

async function main() {
  const allowlist = JSON.parse(await fs.readFile(ALLOWLIST_PATH, 'utf8'));
  const pathAllowlist = (allowlist.pathPatterns || []).map(globLikeToRegex);
  const tokenAllowlist = (allowlist.tokenPatterns || []).map((p) => new RegExp(p));

  const files = await walk(SRC_DIR);
  const violations = [];
  const UI_ATTRS = new Set([
    'label',
    'placeholder',
    'title',
    'aria-label',
    'aria-placeholder',
    'alt',
    'emptyMessage',
    'emptyLabel',
    'actionLabel',
    'helperText',
    'description',
    'caption',
  ]);
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
    'emptyMessage',
    'emptyLabel',
    'actionLabel',
  ]);
  const UI_PARAM_DEFAULTS = new Set([
    'label',
    'title',
    'placeholder',
    'emptyMessage',
    'emptyLabel',
    'actionLabel',
    'helperText',
    'description',
    'caption',
  ]);

  for (const file of files) {
    const srcPath = file.replace(/^frontend\//, '');
    if (matchesAnyPattern(srcPath, pathAllowlist)) continue;

    const content = await fs.readFile(path.join(ROOT, srcPath), 'utf8');
    const sf = ts.createSourceFile(
      srcPath,
      content,
      ts.ScriptTarget.Latest,
      true,
      srcPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const raw = normalizeUiText(node.text || '');
        if (raw && !isNoiseText(raw) && !matchesAnyPattern(raw, tokenAllowlist)) {
          const pos = toLineCol(content, node.getStart(sf));
          violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'jsx', text: raw });
        }
      }

      if (ts.isJsxAttribute(node)) {
        const name = getPropName(node.name);
        if (UI_ATTRS.has(name)) {
          const direct = normalizeUiText(getStringFromInitializer(node.initializer) || '');
          if (direct && !isNoiseText(direct) && !matchesAnyPattern(direct, tokenAllowlist)) {
            const pos = toLineCol(content, node.getStart(sf));
            violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'prop', text: direct });
          }

          if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
            const literals = collectUiExpressionLiterals(node.initializer.expression);
            for (const literalNode of literals) {
              const raw = normalizeUiText(literalNode.text);
              if (!raw || isNoiseText(raw) || matchesAnyPattern(raw, tokenAllowlist)) continue;
              const pos = toLineCol(content, literalNode.getStart(sf));
              violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'prop-expr', text: raw });
            }
          }
        }
      }

      if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!element.initializer) continue;
          if (!ts.isIdentifier(element.name)) continue;
          const propName = (element.propertyName && ts.isIdentifier(element.propertyName))
            ? element.propertyName.text
            : element.name.text;
          if (!UI_PARAM_DEFAULTS.has(propName)) continue;
          const raw = normalizeUiText(getTextFromLiteral(element.initializer) || '');
          if (!raw || isNoiseText(raw) || matchesAnyPattern(raw, tokenAllowlist)) continue;
          const pos = toLineCol(content, element.initializer.getStart(sf));
          violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'param-default', text: raw });
        }
      }

      if (ts.isPropertyAssignment(node) && !node.questionToken) {
        const key = ts.isIdentifier(node.name)
          ? node.name.text
          : ts.isStringLiteral(node.name)
            ? node.name.text
            : null;
        if (key && UI_OBJECT_KEYS.has(key)) {
          const raw = normalizeUiText(getTextFromLiteral(node.initializer) || '');
          if (raw && !isNoiseText(raw) && !matchesAnyPattern(raw, tokenAllowlist)) {
            const pos = toLineCol(content, node.getStart(sf));
            violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'object', text: raw });
          }
        }
      }

      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (isTranslationCall(node)) {
          ts.forEachChild(node, visit);
          return;
        }

        const parent = node.parent;
        if (parent && ts.isJsxExpression(parent)) {
          const container = parent.parent;
          if (container && (ts.isJsxElement(container) || ts.isJsxFragment(container))) {
            const raw = normalizeUiText(node.text);
            if (raw && !isNoiseText(raw) && !matchesAnyPattern(raw, tokenAllowlist)) {
              const pos = toLineCol(content, node.getStart(sf));
              violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'jsx-expr', text: raw });
            }
          } else if (container && ts.isJsxAttribute(container)) {
            const attrName = getPropName(container.name);
            if (UI_ATTRS.has(attrName)) {
              const raw = normalizeUiText(node.text);
              if (raw && !isNoiseText(raw) && !matchesAnyPattern(raw, tokenAllowlist)) {
                const pos = toLineCol(content, node.getStart(sf));
                violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'prop-expr', text: raw });
              }
            }
          }
        } else if (
          parent &&
          ts.isBinaryExpression(parent) &&
          (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
          parent.right === node &&
          ts.isJsxExpression(parent.parent)
        ) {
          const raw = normalizeUiText(node.text);
          if (raw && !isNoiseText(raw) && !matchesAnyPattern(raw, tokenAllowlist)) {
            const pos = toLineCol(content, node.getStart(sf));
            violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'jsx-fallback', text: raw });
          }
        } else if (
          parent &&
          ts.isConditionalExpression(parent) &&
          (parent.whenTrue === node || parent.whenFalse === node) &&
          ts.isJsxExpression(parent.parent)
        ) {
          const raw = normalizeUiText(node.text);
          if (raw && !isNoiseText(raw) && !matchesAnyPattern(raw, tokenAllowlist)) {
            const pos = toLineCol(content, node.getStart(sf));
            violations.push({ file: srcPath, line: pos.line, col: pos.col, kind: 'jsx-conditional', text: raw });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  const deduped = [];
  const seen = new Set();
  for (const v of violations) {
    const key = `${v.file}:${v.line}:${v.col}:${v.kind}:${v.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }

  if (deduped.length) {
    console.error(`Detected ${deduped.length} likely hardcoded UI strings.`);
    for (const v of deduped.slice(0, 400)) {
      console.error(`- ${v.file}:${v.line}:${v.col} [${v.kind}] ${v.text}`);
    }
    if (deduped.length > 400) {
      console.error(`... plus ${deduped.length - 400} more`);
    }
    process.exit(1);
  }

  console.log('No hardcoded UI strings detected by scanner.');
}

main().catch((err) => {
  console.error('scan-hardcoded-ui failed:', err);
  process.exit(1);
});
