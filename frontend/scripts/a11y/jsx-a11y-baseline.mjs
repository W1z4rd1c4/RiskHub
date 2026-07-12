#!/usr/bin/env node
/**
 * jsx-a11y fingerprinted baseline validator (ADR-013 · FR-P1-4 · N4–N6).
 *
 * Runs eslint-plugin-jsx-a11y (rules pinned to `error` in eslint.config.js) over
 * the application source and enforces a COMMITTED, fingerprinted baseline so the
 * still-broken app stays green while every NEW violation fails and the baseline can
 * only SHRINK:
 *
 *   - baseline file: scripts/a11y/jsx-a11y-baseline.json
 *   - fingerprint key: `rule | file | line | column`  (file + rule + location, N5)
 *   - a current finding NOT in the baseline  -> FAIL (new violation)
 *   - a baseline entry NOT matched this run  -> FAIL (stale/unused; forces shrink)
 *
 * This is NOT a bare `--max-warnings` total (N6): a fixed violation cannot be
 * silently replaced by a new one, because each is keyed by its exact location.
 *
 * Modes:
 *   (default)          check mode — exit 1 on any new or stale entry.
 *   --write            regenerate the baseline AND the ESLint-native
 *                      `eslint-suppressions.json` (count-keyed) from the current
 *                      findings. Run this after a phase fixes violations so the
 *                      baseline shrinks. Never run in CI.
 *   --report-json[=p]  also write a JSON report (default under tests/results).
 *   --root=<dir>       explicit frontend root (defaults to autodetect).
 *
 * `eslint-suppressions.json` is a generated convenience so `eslint .` exits 0 on
 * the still-broken app; THIS file + validator is the authoritative gate.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const ARGS = process.argv.slice(2);
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULE_PREFIX = 'jsx-a11y/';
const BASELINE_RELPATH = path.join('scripts', 'a11y', 'jsx-a11y-baseline.json');
const SUPPRESSIONS_RELPATH = 'eslint-suppressions.json';
const LINT_TARGETS = ['src'];

function toPosix(relPath) {
  return relPath.replaceAll(path.sep, '/');
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
  return (await pathExists(path.join(root, 'src'))) && (await pathExists(path.join(root, 'eslint.config.js')));
}

function getFlagValue(name) {
  const exact = ARGS.find((arg) => arg === name || arg.startsWith(`${name}=`));
  if (!exact) return null;
  if (exact === name) return '';
  const [, value] = exact.split('=');
  return value ?? '';
}

async function resolveRoot() {
  const explicit = getFlagValue('--root');
  if (explicit !== null) {
    const root = path.resolve(process.cwd(), explicit || '.');
    if (!(await isFrontendRoot(root))) throw new Error(`Invalid frontend root: ${root}`);
    return root;
  }
  if (await isFrontendRoot(process.cwd())) return process.cwd();
  return SCRIPT_ROOT;
}

/** Collect every jsx-a11y finding, keyed by rule|file|line|column. */
async function collectFindings(root) {
  // A fresh ESLint instance; the Node API does not auto-apply eslint-suppressions.json,
  // so this always sees the UNsuppressed set of current violations.
  const eslint = new ESLint({ cwd: root, errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(LINT_TARGETS);
  const findings = [];
  for (const result of results) {
    const relFile = toPosix(path.relative(root, result.filePath));
    for (const message of result.messages) {
      if (!message.ruleId || !message.ruleId.startsWith(RULE_PREFIX)) continue;
      findings.push({
        rule: message.ruleId,
        file: relFile,
        line: message.line ?? 0,
        column: message.column ?? 0,
        messageId: message.messageId ?? null,
      });
    }
  }
  return findings;
}

function fingerprint(entry) {
  return `${entry.rule}|${entry.file}|${entry.line}|${entry.column}`;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    fingerprint(a) < fingerprint(b) ? -1 : fingerprint(a) > fingerprint(b) ? 1 : 0,
  );
}

async function loadBaseline(root) {
  const baselinePath = path.join(root, BASELINE_RELPATH);
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function buildSuppressions(findings) {
  // ESLint-native bulk-suppressions format: { [relFile]: { [ruleId]: { count } } }.
  const suppressions = {};
  for (const f of sortEntries(findings)) {
    const forFile = (suppressions[f.file] ??= {});
    const forRule = (forFile[f.rule] ??= { count: 0 });
    forRule.count += 1;
  }
  return suppressions;
}

async function writeBaseline(root, findings) {
  const baselinePath = path.join(root, BASELINE_RELPATH);
  const payload = {
    _comment:
      'ADR-013 FR-P1-4 fingerprinted jsx-a11y baseline (file+rule+location). Generated by scripts/a11y/jsx-a11y-baseline.mjs --write. May only SHRINK; never hand-widen.',
    generatedAt: new Date().toISOString(),
    count: findings.length,
    entries: sortEntries(findings),
  };
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const suppressionsPath = path.join(root, SUPPRESSIONS_RELPATH);
  await fs.writeFile(suppressionsPath, `${JSON.stringify(buildSuppressions(findings), null, 2)}\n`, 'utf8');
  return { baselinePath, suppressionsPath };
}

function defaultReportPath(root) {
  const base = path.basename(root) === 'frontend' ? path.join(root, '..') : root;
  return path.join(base, 'tests', 'results', 'quality', 'frontend', 'a11y', 'jsx-a11y-baseline.json');
}

function resolveReportPath(root) {
  const flag = getFlagValue('--report-json');
  if (flag === null) return null;
  if (!flag) return defaultReportPath(root);
  return path.isAbsolute(flag) ? flag : path.resolve(process.cwd(), flag);
}

async function writeReport(reportPath, payload) {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const root = await resolveRoot();
  const write = ARGS.includes('--write');
  const findings = await collectFindings(root);

  if (write) {
    const { baselinePath, suppressionsPath } = await writeBaseline(root, findings);
    console.log(`jsx-a11y baseline written: ${findings.length} entries -> ${toPosix(path.relative(root, baselinePath))}`);
    console.log(`eslint-native suppressions written -> ${toPosix(path.relative(root, suppressionsPath))}`);
    return;
  }

  const baseline = await loadBaseline(root);
  const baselineKeys = new Map(baseline.map((entry) => [fingerprint(entry), entry]));
  const currentKeys = new Set(findings.map(fingerprint));

  const newViolations = findings.filter((f) => !baselineKeys.has(fingerprint(f)));
  const staleEntries = baseline.filter((entry) => !currentKeys.has(fingerprint(entry)));

  const reportPath = resolveReportPath(root);
  await writeReport(reportPath, {
    generatedAt: new Date().toISOString(),
    baselineEntries: baseline.length,
    currentFindings: findings.length,
    newViolations,
    staleEntries,
  });

  if (newViolations.length > 0 || staleEntries.length > 0) {
    console.error('jsx-a11y baseline check FAILED.\n');
    if (newViolations.length > 0) {
      console.error(`New violations (not in baseline) — fix them or they block the gate: ${newViolations.length}`);
      for (const v of sortEntries(newViolations)) {
        console.error(`  + ${v.file}:${v.line}:${v.column} [${v.rule}]`);
      }
    }
    if (staleEntries.length > 0) {
      console.error(
        `\nStale baseline entries (no longer present) — regenerate with \`--write\` so the baseline shrinks: ${staleEntries.length}`,
      );
      for (const v of sortEntries(staleEntries)) {
        console.error(`  - ${v.file}:${v.line}:${v.column} [${v.rule}]`);
      }
    }
    process.exit(1);
  }

  console.log(`jsx-a11y baseline OK: ${findings.length} findings all held by baseline (${baseline.length} entries).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
