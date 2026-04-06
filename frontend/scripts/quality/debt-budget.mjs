import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
const TEST_PATH_RE = /(?:^|\/)(__tests__|test)\//;

const RULES = {
  ESLINT_DISABLE: 'eslint-disable',
  TS_DIRECTIVE: 'ts-directive',
  NO_EXPLICIT_ANY_SUPPRESSION: 'no-explicit-any-suppression',
  EXPLICIT_ANY: 'explicit-any',
  COMMENT_DEBT_MARKER: 'comment-debt-marker',
};

function toPosix(relPath) {
  return relPath.replaceAll(path.sep, '/');
}

function toLineCol(source, index) {
  const chunk = source.slice(0, index);
  const lines = chunk.split('\n');
  return { line: lines.length, col: (lines.at(-1) || '').length + 1 };
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isFrontendRoot(root) {
  return (
    await pathExists(path.join(root, 'src'))
  ) && (
    await pathExists(path.join(root, 'scripts', 'quality'))
  );
}

function getFlagValue(name) {
  const exact = ARGS.find((arg) => arg === name || arg.startsWith(`${name}=`));
  if (!exact) return null;
  if (exact === name) return '';
  const [, value] = exact.split('=');
  return value ?? '';
}

async function resolveRoot() {
  const explicitRootArg = getFlagValue('--root');
  if (explicitRootArg !== null) {
    const explicitRoot = path.resolve(process.cwd(), explicitRootArg || '.');
    if (!(await isFrontendRoot(explicitRoot))) {
      throw new Error(`Invalid frontend root: ${explicitRoot}`);
    }
    return explicitRoot;
  }

  if (await isFrontendRoot(process.cwd())) {
    return process.cwd();
  }

  return SCRIPT_ROOT;
}

function isDateExpired(expiresOn) {
  const expires = new Date(`${expiresOn}T23:59:59.999Z`);
  if (Number.isNaN(expires.getTime())) return true;
  return Date.now() > expires.getTime();
}

function buildExceptionIndex(exceptions) {
  const index = new Map();
  const errors = [];

  for (const [idx, entry] of exceptions.entries()) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`allowlist entry #${idx + 1} is not an object`);
      continue;
    }

    const { rule, file, line, owner, issue, expiresOn, reason } = entry;
    const hasAllFields = [rule, file, line, owner, issue, expiresOn, reason].every((value) => value !== undefined && value !== null && value !== '');
    if (!hasAllFields) {
      errors.push(`allowlist entry #${idx + 1} is missing required fields (rule,file,line,owner,issue,expiresOn,reason)`);
      continue;
    }

    if (typeof line !== 'number' || line < 1) {
      errors.push(`allowlist entry #${idx + 1} has invalid line "${line}"`);
      continue;
    }

    if (isDateExpired(expiresOn)) {
      errors.push(`allowlist entry expired: ${file}:${line} [${rule}] (issue ${issue}, expired ${expiresOn})`);
      continue;
    }

    const key = `${rule}|${file}|${line}`;
    index.set(key, entry);
  }

  return { index, errors };
}

async function walk(dir, root, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, root, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
    const rel = toPosix(path.relative(root, fullPath));
    if (TEST_FILE_RE.test(rel) || TEST_PATH_RE.test(rel)) continue;
    acc.push(fullPath);
  }
  return acc;
}

function collectCommentViolations(relPath, source, violations) {
  const patterns = [
    { rule: RULES.ESLINT_DISABLE, regex: /eslint-disable(?:-next-line|-line)?/g },
    { rule: RULES.TS_DIRECTIVE, regex: /@ts-ignore|@ts-expect-error/g },
    { rule: RULES.NO_EXPLICIT_ANY_SUPPRESSION, regex: /no-explicit-any/g },
    { rule: RULES.COMMENT_DEBT_MARKER, regex: /(?:\/\/|\/\*+|\*)\s*(?:TODO|FIXME|HACK|XXX)\b/gi },
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern.regex)) {
      const index = match.index ?? 0;
      const location = toLineCol(source, index);
      violations.push({
        rule: pattern.rule,
        file: relPath,
        line: location.line,
        col: location.col,
        snippet: (match[0] || '').trim(),
      });
    }
  }
}

function collectExplicitAnyViolations(relPath, source, filePath, violations) {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const location = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      violations.push({
        rule: RULES.EXPLICIT_ANY,
        file: relPath,
        line: location.line + 1,
        col: location.character + 1,
        snippet: 'any',
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
}

async function loadAllowlist(root) {
  const allowlistPath = path.join(root, 'scripts', 'quality', 'debt-allowlist.json');
  try {
    const raw = await fs.readFile(allowlistPath, 'utf8');
    const parsed = JSON.parse(raw);
    const exceptions = Array.isArray(parsed.exceptions) ? parsed.exceptions : [];
    return exceptions;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function defaultReportPath(root) {
  if (path.basename(root) === 'frontend') {
    return path.join(root, '..', 'tests', 'results', 'quality', 'frontend', 'debt-budget', 'debt.json');
  }
  return path.join(root, 'tests', 'results', 'quality', 'frontend', 'debt-budget', 'debt.json');
}

function resolveReportPath(root) {
  const flag = ARGS.find((arg) => arg === '--report-json' || arg.startsWith('--report-json='));
  if (!flag) return null;
  if (flag === '--report-json') {
    return defaultReportPath(root);
  }
  const [, rawPath] = flag.split('=');
  if (!rawPath) {
    return defaultReportPath(root);
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function normalizeCliPath(rawPath, root) {
  const normalized = rawPath.replaceAll('\\', '/');
  if (path.isAbsolute(rawPath)) {
    return toPosix(path.relative(root, rawPath));
  }
  return normalized.startsWith('frontend/') ? normalized.slice('frontend/'.length) : normalized;
}

function isEligibleSourcePath(relPath) {
  return relPath.startsWith('src/') && FILE_EXTENSIONS.has(path.extname(relPath)) && !TEST_FILE_RE.test(relPath) && !TEST_PATH_RE.test(relPath);
}

async function resolveScanFiles(root) {
  const srcDir = path.join(root, 'src');
  const explicitPaths = ARGS
    .filter((arg) => !arg.startsWith('--report-json') && !arg.startsWith('--root'))
    .map((arg) => normalizeCliPath(arg, root))
    .filter(Boolean);

  if (explicitPaths.length === 0) {
    return walk(srcDir, root);
  }

  const files = [];
  const seen = new Set();

  for (const relPath of explicitPaths) {
    if (!isEligibleSourcePath(relPath)) continue;

    const fullPath = path.join(root, relPath);
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile() || seen.has(fullPath)) continue;
    } catch {
      continue;
    }

    seen.add(fullPath);
    files.push(fullPath);
  }

  return files;
}

async function writeJsonReport(reportPath, payload) {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const root = await resolveRoot();
  const reportPath = resolveReportPath(root);
  const files = await resolveScanFiles(root);
  const allowlistEntries = await loadAllowlist(root);
  const { index: allowlistIndex, errors: allowlistErrors } = buildExceptionIndex(allowlistEntries);

  const violations = [];
  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf8');
    const relPath = toPosix(path.relative(root, filePath));

    collectCommentViolations(relPath, source, violations);
    collectExplicitAnyViolations(relPath, source, filePath, violations);
  }

  const remainingViolations = [];
  const consumedAllowlistKeys = new Set();

  for (const violation of violations) {
    const key = `${violation.rule}|${violation.file}|${violation.line}`;
    if (allowlistIndex.has(key)) {
      consumedAllowlistKeys.add(key);
      continue;
    }
    remainingViolations.push(violation);
  }

  const unusedAllowlist = [];
  for (const [key, entry] of allowlistIndex.entries()) {
    if (!consumedAllowlistKeys.has(key)) {
      unusedAllowlist.push(`unused allowlist entry: ${entry.file}:${entry.line} [${entry.rule}] (issue ${entry.issue})`);
    }
  }

  const errors = [...allowlistErrors, ...unusedAllowlist];
  const reportPayload = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    violations: remainingViolations,
    errors,
  };
  await writeJsonReport(reportPath, reportPayload);

  if (errors.length > 0 || remainingViolations.length > 0) {
    console.error('Debt budget exceeded for frontend/src.\n');

    for (const err of errors) {
      console.error(`- ${err}`);
    }

    for (const violation of remainingViolations) {
      console.error(`- ${violation.file}:${violation.line}:${violation.col} [${violation.rule}] ${violation.snippet}`);
    }
    process.exit(1);
  }

  if (reportPath) {
    console.log(`Debt budget report written to ${reportPath}`);
  }
  console.log('Debt budget passed: no disallowed debt markers in frontend/src.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
