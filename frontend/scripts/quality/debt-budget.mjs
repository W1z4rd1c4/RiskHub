import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const RULES = [
  { name: 'eslint-disable', regex: /eslint-disable(?:-next-line|-line)?/g },
  { name: '@ts-ignore/@ts-expect-error', regex: /@ts-ignore|@ts-expect-error/g },
  { name: 'no-explicit-any suppression', regex: /no-explicit-any/g },
];

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
    acc.push(fullPath);
  }
  return acc;
}

function toLineCol(source, index) {
  const before = source.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, col: (lines.at(-1) || '').length + 1 };
}

async function main() {
  const files = await walk(SRC_DIR);
  const violations = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');

    for (const rule of RULES) {
      const matches = content.matchAll(rule.regex);
      for (const match of matches) {
        const location = toLineCol(content, match.index ?? 0);
        violations.push({
          file: relPath,
          line: location.line,
          col: location.col,
          rule: rule.name,
          snippet: (match[0] || '').trim(),
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error('Debt budget exceeded: production src/ contains disallowed suppression markers.\n');
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line}:${violation.col} [${violation.rule}] ${violation.snippet}`);
    }
    process.exit(1);
  }

  console.log('Debt budget passed: no suppression markers in frontend/src.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
