#!/usr/bin/env node
/**
 * Strict-zero jsx-a11y gate (ADR-013 · FR-P1-4).
 *
 * Every enabled recommended jsx-a11y rule is configured as an error. This gate
 * independently collects those findings through ESLint's Node API and requires:
 *   - zero current findings;
 *   - a present, well-formed baseline file with zero entries; and
 *   - a present, well-formed ESLint suppressions file with zero entries.
 *
 * There is deliberately no write/update/anchor/deviation path. Introducing an
 * exception mechanism requires a separate policy change and tracked approval.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

import {
  evaluateZeroPolicy,
  parseEmptyBaseline,
  parseEmptySuppressions,
} from './jsx-a11y-zero-policy.mjs';

export { evaluateZeroPolicy, parseEmptyBaseline, parseEmptySuppressions };

const args = process.argv.slice(2);
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rulePrefix = 'jsx-a11y/';
const baselineRelPath = path.join('scripts', 'a11y', 'jsx-a11y-baseline.json');
const suppressionsRelPath = 'eslint-suppressions.json';

function flagValue(name) {
  const index = args.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return null;
  const arg = args[index];
  if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  const next = args[index + 1];
  return next && !next.startsWith('--') ? next : '';
}

function validateArguments() {
  const known = new Set(['--root', '--report-json']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const name = arg.split('=')[0];
    if (!known.has(name)) {
      throw new Error(`Unsupported jsx-a11y gate argument: ${name}. This strict-zero policy has no update mode.`);
    }
    if (!arg.includes('=') && args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
  }
}

async function resolveRoot() {
  const requested = flagValue('--root');
  const root = requested !== null ? path.resolve(process.cwd(), requested || '.') : scriptRoot;
  await fs.access(path.join(root, 'src'));
  await fs.access(path.join(root, 'eslint.config.js'));
  return root;
}

async function collectFindings(root) {
  const eslint = new ESLint({
    cwd: root,
    errorOnUnmatchedPattern: false,
    allowInlineConfig: false,
  });
  const results = await eslint.lintFiles(['src']);
  return results.flatMap((result) => {
    const file = path.relative(root, result.filePath).replaceAll(path.sep, '/');
    return result.messages
      .filter((message) => message.ruleId?.startsWith(rulePrefix))
      .map((message) => ({
        rule: message.ruleId,
        file,
        line: message.line ?? 0,
        column: message.column ?? 0,
      }));
  });
}

async function writeReport(root, payload) {
  const requested = flagValue('--report-json');
  if (requested === null) return;
  const defaultPath = path.resolve(root, '../tests/results/quality/frontend/a11y/jsx-a11y-zero.json');
  const reportPath = requested
    ? (path.isAbsolute(requested) ? requested : path.resolve(process.cwd(), requested))
    : defaultPath;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  validateArguments();
  const root = await resolveRoot();
  const baselineEntries = parseEmptyBaseline(
    await fs.readFile(path.join(root, baselineRelPath), 'utf8'),
  );
  const suppressions = parseEmptySuppressions(
    await fs.readFile(path.join(root, suppressionsRelPath), 'utf8'),
  );
  const findings = await collectFindings(root);
  const failures = evaluateZeroPolicy({ findings, baselineEntries, suppressions });

  await writeReport(root, {
    generatedAt: new Date().toISOString(),
    findings,
    baselineEntryCount: baselineEntries.length,
    suppressionEntryCount: Object.keys(suppressions).length,
    failures,
  });

  if (failures.length > 0) {
    console.error(`jsx-a11y strict-zero gate FAILED: ${failures.join('; ')}`);
    for (const finding of findings) {
      console.error(`  ${finding.file}:${finding.line}:${finding.column} [${finding.rule}]`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('jsx-a11y strict-zero gate OK: 0 findings, 0 baseline entries, 0 suppressions.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
