import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const LOCALE_EN_DIR = path.join(SRC_DIR, 'i18n', 'locales', 'en');
const LOCALE_CS_DIR = path.join(SRC_DIR, 'i18n', 'locales', 'cs');

const FILE_EXCLUDE = [
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /\/__tests__\//,
  /\/test\//,
  /\.d\.ts$/,
  /\/i18n\/locales\//,
];

function shouldSkipFile(file) {
  return FILE_EXCLUDE.some((re) => re.test(file));
}

function flatten(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name).sort();
}

async function loadLocaleMaps() {
  const [enFiles, csFiles] = await Promise.all([listJsonFiles(LOCALE_EN_DIR), listJsonFiles(LOCALE_CS_DIR)]);
  const namespaceFiles = [...new Set([...enFiles, ...csFiles])];

  const enMap = new Map();
  const csMap = new Map();

  for (const file of namespaceFiles) {
    const namespace = file.replace(/\.json$/, '');
    const enPath = path.join(LOCALE_EN_DIR, file);
    const csPath = path.join(LOCALE_CS_DIR, file);

    const enRaw = await fs.readFile(enPath, 'utf8').catch(() => '{}');
    const csRaw = await fs.readFile(csPath, 'utf8').catch(() => '{}');

    enMap.set(namespace, flatten(JSON.parse(enRaw)));
    csMap.set(namespace, flatten(JSON.parse(csRaw)));
  }

  return { enMap, csMap };
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
    if (shouldSkipFile(rel)) continue;
    acc.push(rel);
  }
  return acc;
}

function getStringLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function extractNamespaceFromUseTranslationCall(node) {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'useTranslation') return null;
  if (node.arguments.length === 0) return null;
  const firstArg = node.arguments[0];
  const ns = getStringLiteral(firstArg);
  if (ns) return ns;

  if (ts.isArrayLiteralExpression(firstArg)) {
    for (const element of firstArg.elements) {
      const value = getStringLiteral(element);
      if (value) return value;
    }
  }
  return null;
}

function extractBindings(sourceFile) {
  const tVarToNs = new Map();
  const i18nObjToNs = new Map();

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const ns = extractNamespaceFromUseTranslationCall(node.initializer);
      if (ns !== null || (ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === 'useTranslation')) {
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            const localName = element.name.text;
            const propName = element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : ts.isIdentifier(element.name) ? element.name.text : '';
            if (propName === 't') {
              tVarToNs.set(localName, ns || 'common');
            }
          }
        } else if (ts.isIdentifier(node.name)) {
          i18nObjToNs.set(node.name.text, ns || 'common');
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!tVarToNs.has('t')) tVarToNs.set('t', 'common');
  return { tVarToNs, i18nObjToNs };
}

function lineCol(content, pos) {
  const chunk = content.slice(0, pos);
  const lines = chunk.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function parseKey(rawKey, defaultNs) {
  if (!rawKey) return null;
  if (rawKey.includes(':')) {
    const [ns, key] = rawKey.split(':');
    if (!ns || !key) return null;
    return { namespace: ns, key };
  }
  return { namespace: defaultNs || 'common', key: rawKey };
}

function extractNsOption(argNode) {
  if (!argNode || !ts.isObjectLiteralExpression(argNode)) return null;
  for (const prop of argNode.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null;
    if (name !== 'ns') continue;
    return getStringLiteral(prop.initializer);
  }
  return null;
}

async function main() {
  const { enMap, csMap } = await loadLocaleMaps();
  const files = await walk(SRC_DIR);
  const problems = [];

  for (const file of files) {
    const abs = path.join(ROOT, file);
    const content = await fs.readFile(abs, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const { tVarToNs, i18nObjToNs } = extractBindings(sourceFile);

    const visit = (node) => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        let defaultNs = null;

        if (ts.isIdentifier(node.expression) && tVarToNs.has(node.expression.text)) {
          defaultNs = tVarToNs.get(node.expression.text);
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.name.text === 't'
        ) {
          const objName = node.expression.expression.text;
          if (i18nObjToNs.has(objName)) {
            defaultNs = i18nObjToNs.get(objName);
          }
        }

        if (defaultNs !== null) {
          const first = getStringLiteral(node.arguments[0]);
          if (first) {
            const explicitNs = extractNsOption(node.arguments[1]);
            const parsed = parseKey(first, explicitNs || defaultNs);
            const fallbackArg = node.arguments[1];
            const fallbackLiteral = fallbackArg ? getStringLiteral(fallbackArg) : null;
            const lc = lineCol(content, node.getStart(sourceFile));

            if (!parsed) {
              problems.push({
                file,
                line: lc.line,
                col: lc.col,
                reason: `Invalid translation key format: "${first}"`,
              });
            } else {
              const enKeys = enMap.get(parsed.namespace);
              const csKeys = csMap.get(parsed.namespace);

              if (!enKeys) {
                problems.push({
                  file,
                  line: lc.line,
                  col: lc.col,
                  reason: `Unknown namespace "${parsed.namespace}" for key "${first}"`,
                });
              } else {
                const inEn = enKeys.has(parsed.key);
                const inCs = csKeys?.has(parsed.key) ?? false;

                if (!inEn || !inCs) {
                  problems.push({
                    file,
                    line: lc.line,
                    col: lc.col,
                    reason: `Missing locale key "${parsed.namespace}.${parsed.key}" (en=${inEn}, cs=${inCs})`,
                  });
                }

                if (fallbackLiteral && (!inEn || !inCs)) {
                  problems.push({
                    file,
                    line: lc.line,
                    col: lc.col,
                    reason: `Fallback literal "${fallbackLiteral}" is masking missing key "${parsed.namespace}.${parsed.key}"`,
                  });
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (problems.length > 0) {
    console.error(`i18n key usage validation failed with ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 500)) {
      console.error(`- ${p.file}:${p.line}:${p.col} ${p.reason}`);
    }
    if (problems.length > 500) {
      console.error(`... plus ${problems.length - 500} more`);
    }
    process.exit(1);
  }

  console.log(`i18n key usage OK across ${files.length} source files.`);
}

main().catch((err) => {
  console.error('validate-key-usage failed:', err);
  process.exit(1);
});
