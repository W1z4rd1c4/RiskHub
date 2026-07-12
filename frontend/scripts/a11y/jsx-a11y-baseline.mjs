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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

import {
  deviationFingerprint,
  fingerprint,
  parseBaselineJson,
  ratchetAgainstBaseRef,
  validateDeviations,
} from './jsx-a11y-ratchet.mjs';

// Re-export the pure seam so callers/tests can import from either entry point
// while the CLI keeps ownership of every impure edge (ESLint, fs, git).
export { deviationFingerprint, fingerprint, parseBaselineJson, ratchetAgainstBaseRef, validateDeviations };

const ARGS = process.argv.slice(2);
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULE_PREFIX = 'jsx-a11y/';
const BASELINE_RELPATH = path.join('scripts', 'a11y', 'jsx-a11y-baseline.json');
const DEVIATIONS_RELPATH = path.join('scripts', 'a11y', 'jsx-a11y-deviations.json');
const ANCHOR_RELPATH = path.join('scripts', 'a11y', 'baseline-anchor.json');
const SUPPRESSIONS_RELPATH = 'eslint-suppressions.json';
const LINT_TARGETS = ['src'];
const DEFAULT_BASE_REF = 'origin/main';

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

function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    fingerprint(a) < fingerprint(b) ? -1 : fingerprint(a) > fingerprint(b) ? 1 : 0,
  );
}

async function loadBaseline(root) {
  const baselinePath = path.join(root, BASELINE_RELPATH);
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    return parseBaselineJson(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

/** Resolve the base ref for the ratchet: `--base-ref <ref>`, then env, then default. */
function resolveBaseRef() {
  const flag = getFlagValue('--base-ref');
  if (flag !== null && flag !== '') return flag;
  if (process.env.A11Y_BASELINE_BASE_REF) return process.env.A11Y_BASELINE_BASE_REF;
  return DEFAULT_BASE_REF;
}

/** Run a git command under `root`, returning stdout or `null` on any failure. */
function gitCapture(args, root) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** Read the committed anchor SHA (fail-closed fallback base ref) from baseline-anchor.json, or `null`. */
async function loadAnchorSha(root) {
  const anchorPath = path.join(root, ANCHOR_RELPATH);
  try {
    const parsed = JSON.parse(await fs.readFile(anchorPath, 'utf8'));
    const sha = typeof parsed?.anchorSha === 'string' ? parsed.anchorSha.trim() : '';
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

/**
 * `git show <ref>:<repoRelPath>` and parse it as a baseline. Returns the entries
 * array, or `null` when the ref is unknown, the file is ABSENT at that ref, or it
 * does not parse — i.e. this base-ref candidate did not resolve.
 */
function tryShowAndParse(root, ref, repoRelPath) {
  const raw = gitCapture(['show', `${ref}:${repoRelPath}`], root);
  if (raw === null) return null;
  try {
    return parseBaselineJson(raw);
  } catch {
    return null;
  }
}

/**
 * Resolve the base-ref jsx-a11y baseline for the ratchet, FAIL-CLOSED. Order:
 *   1. `primaryRef` (default `origin/main`, or a --base-ref/env override) IF it
 *      CARRIES the baseline file and it parses;
 *   2. else the committed anchor SHA (scripts/a11y/baseline-anchor.json) — this
 *      repo's honest-baseline commit — IF it carries the baseline file and parses;
 *   3. else `entries: null` — the CLI FAILS (non-zero exit). It NEVER skips: with a
 *      0-entry baseline a skip would silently license re-widening. Once the baseline
 *      lands on main, `origin/main` carries it and takes precedence over the anchor.
 *
 * @returns {Promise<{ entries: Array | null, source: string | null, notice: string | null }>}
 */
async function loadBaseRefBaseline(root, primaryRef) {
  const top = gitCapture(['rev-parse', '--show-toplevel'], root);
  if (top === null) {
    return { entries: null, source: null, notice: 'not a git work tree; cannot resolve a base-ref baseline' };
  }
  const repoRelPath = toPosix(path.relative(top.trim(), path.join(root, BASELINE_RELPATH)));

  const primaryEntries = tryShowAndParse(root, primaryRef, repoRelPath);
  if (primaryEntries !== null) {
    return { entries: primaryEntries, source: primaryRef, notice: null };
  }

  const anchorSha = await loadAnchorSha(root);
  if (anchorSha !== null) {
    const anchorEntries = tryShowAndParse(root, anchorSha, repoRelPath);
    if (anchorEntries !== null) {
      return { entries: anchorEntries, source: `anchor ${anchorSha}`, notice: null };
    }
  }

  return {
    entries: null,
    source: null,
    notice: `no base-ref baseline resolved: '${primaryRef}' lacks it and anchor ${anchorSha ?? '(unset)'} did not resolve`,
  };
}

/**
 * Load the deviation registry, or `null` when the file is ABSENT (keeping the
 * deviation gate dormant until C5a creates it). A present-but-corrupt file throws.
 * Accepts a bare array or a `{ deviations | entries: [...] }` envelope.
 *
 * @returns {Array | null}
 */
async function loadDeviations(root) {
  const deviationsPath = path.join(root, DEVIATIONS_RELPATH);
  try {
    const raw = await fs.readFile(deviationsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.deviations)) return parsed.deviations;
    if (Array.isArray(parsed?.entries)) return parsed.entries;
    return [];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
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

  // Exact check (UNCHANGED): current findings must equal the committed baseline —
  // a new finding fails, a stale entry fails, each keyed by exact location.
  const newViolations = findings.filter((f) => !baselineKeys.has(fingerprint(f)));
  const staleEntries = baseline.filter((entry) => !currentKeys.has(fingerprint(entry)));

  // Base-ref ratchet: the COMMITTED baseline may not WIDEN — every committed
  // fingerprint must exist in the base-ref baseline (exact subset). FAIL-CLOSED:
  // if NEITHER origin/main-with-baseline NOR the committed anchor SHA resolves, the
  // ratchet does not skip — it fails, so the 0-entry baseline can't be re-widened.
  const baseRef = resolveBaseRef();
  const { entries: baseRefEntries, source: baseRefSource, notice: baseRefNotice } = await loadBaseRefBaseline(
    root,
    baseRef,
  );
  const ratchet = ratchetAgainstBaseRef(baseline, baseRefEntries);

  // Deviation registry: dormant until scripts/a11y/jsx-a11y-deviations.json exists.
  const deviations = await loadDeviations(root);
  const deviationResult = validateDeviations(baseline, deviations);

  const reportPath = resolveReportPath(root);
  await writeReport(reportPath, {
    generatedAt: new Date().toISOString(),
    baselineEntries: baseline.length,
    currentFindings: findings.length,
    newViolations,
    staleEntries,
    baseRef,
    baseRefSource,
    ratchet: { resolved: ratchet.resolved, reason: ratchet.reason, widened: ratchet.widened },
    deviations: {
      dormant: deviationResult.dormant,
      ok: deviationResult.ok,
      missing: deviationResult.missing,
      stale: deviationResult.stale,
      duplicates: deviationResult.duplicates,
    },
  });

  const exactFailed = newViolations.length > 0 || staleEntries.length > 0;
  const ratchetFailed = !ratchet.resolved || ratchet.widened.length > 0;
  const deviationFailed = !deviationResult.dormant && !deviationResult.ok;

  if (exactFailed || ratchetFailed || deviationFailed) {
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
    if (ratchetFailed) {
      if (!ratchet.resolved) {
        console.error(
          `\nBase-ref ratchet could NOT resolve a baseline (${baseRefNotice}) — failing closed so the ` +
            `0-entry baseline can never be silently re-widened.`,
        );
      } else {
        console.error(
          `\nBaseline WIDENED vs base-ref (${baseRefSource}) — every committed fingerprint must exist in ` +
            `the base ref: ${ratchet.widened.length} new fingerprint(s)`,
        );
        for (const w of sortEntries(ratchet.widened)) {
          console.error(`  ^ ${w.file}:${w.line}:${w.column} [${w.rule}]`);
        }
      }
    }
    if (deviationFailed) {
      console.error(`\nDeviation registry (${toPosix(DEVIATIONS_RELPATH)}) is out of sync with the baseline:`);
      for (const v of sortEntries(deviationResult.missing)) {
        console.error(`  ? ${v.file}:${v.line}:${v.column} [${v.rule}] — baseline entry has no deviation record`);
      }
      for (const record of deviationResult.stale) {
        console.error(`  - stale deviation (no matching baseline entry): ${deviationFingerprint(record)}`);
      }
      for (const fp of deviationResult.duplicates) {
        console.error(`  ! duplicate deviation record for fingerprint: ${fp}`);
      }
    }
    process.exit(1);
  }

  console.log(`jsx-a11y baseline OK: ${findings.length} findings all held by baseline (${baseline.length} entries).`);
  // Reached only when the ratchet RESOLVED (fail-closed) and did not widen.
  console.log(
    `base-ref ratchet OK vs ${baseRefSource}: every committed fingerprint is present in the base-ref baseline (no widening).`,
  );
  if (!deviationResult.dormant) {
    console.log(`deviation registry OK: ${baseline.length} baseline entr${baseline.length === 1 ? 'y' : 'ies'} mapped 1:1.`);
  }
}

// Run the CLI only when invoked directly (`node scripts/a11y/jsx-a11y-baseline.mjs`),
// NOT when imported by a unit test — so vitest can import the re-exported pure seam
// without triggering an ESLint run or a `process.exit`.
const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
