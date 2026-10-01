#!/usr/bin/env node
/**
 * G-I18N plural validator (D15, GAP-B-14).
 *
 * Every locale leaf that interpolates `{{count}}` must belong to an i18next plural family:
 * - cs: `_one`, `_few`, `_other` (optional `_many`, used for decimals);
 * - en: `_one`, `_other` (en may mirror cs suffixes so that strict key parity holds).
 * Count-free uses (a percentage, a `Label: {{count}}` value, a parenthesised `({{count}})`
 * tally) are exempt via `plural-allowlist.json`.
 *
 * Ratchet mode: existing violations are listed in `plural-baseline.json` and may only go
 * down. A violation not in the baseline fails; `--update-baseline` rewrites the baseline only
 * when nothing new was added (unless `--force`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_VERSION = 1;
export const COUNT_TOKEN = '{{count}}';
export const REQUIRED_FORMS = { cs: ['one', 'few', 'other'], en: ['one', 'other'] };
export const LOCALES = Object.keys(REQUIRED_FORMS);
export const UPDATE_COMMAND = 'npm run i18n:validate:plurals -- --update-baseline';
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

export function flattenLeaves(obj, prefix = '', out = new Map()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenLeaves(value, full, out);
    } else if (typeof value === 'string') {
      out.set(full, value);
    }
  }
  return out;
}

export function compileInvariantPatterns(allowlist) {
  return (allowlist?.invariantValuePatterns ?? []).map((entry, index) => {
    if (!entry || typeof entry.pattern !== 'string' || !entry.reason) {
      throw new Error(`plural-allowlist invariantValuePatterns[${index}] requires pattern and reason`);
    }
    return new RegExp(entry.pattern);
  });
}

/** `{{ count }}` and formatted `{{count, number}}` interpolate the same i18next count option. */
const COUNT_PLACEHOLDER_RE = /\{\{\s*count\s*(?:,[^}]*)?\}\}/g;

/**
 * A value needs plural forms when it interpolates {{count}} outside an invariant (count-free)
 * form. Every invariant use is removed first, so a value that also has a counted noun
 * (`{{count}}% of {{count}} risks`) is still checked.
 */
export function needsPluralForms(value, invariantPatterns = []) {
  let rest = value.replace(COUNT_PLACEHOLDER_RE, COUNT_TOKEN);
  if (!rest.includes(COUNT_TOKEN)) return false;
  for (const pattern of invariantPatterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    rest = rest.replace(new RegExp(pattern.source, flags), '');
  }
  return rest.includes(COUNT_TOKEN);
}

/**
 * Finds plural-family violations for one locale.
 * @param {string} locale - `cs` or `en`.
 * @param {Record<string, object>} namespaces - `{ [namespace]: localeJson }`.
 * @returns {{ id: string, missing: string[] }[]} sorted by id (`namespace:baseKey`).
 */
export function findPluralViolations(locale, namespaces, { invariantPatterns = [], exemptKeys = new Set() } = {}) {
  const required = REQUIRED_FORMS[locale];
  if (!required) throw new Error(`No plural rules configured for locale "${locale}"`);
  const violations = [];

  for (const namespace of Object.keys(namespaces).sort()) {
    const leaves = flattenLeaves(namespaces[namespace]);
    const countedFamilies = new Set();
    for (const [key, value] of leaves) {
      if (needsPluralForms(value, invariantPatterns)) {
        countedFamilies.add(key.replace(PLURAL_SUFFIX_RE, ''));
      }
    }
    for (const base of [...countedFamilies].sort()) {
      const id = `${namespace}:${base}`;
      if (exemptKeys.has(id)) continue;
      const missing = required.filter((form) => !leaves.has(`${base}_${form}`));
      if (missing.length > 0) violations.push({ id, missing });
    }
  }
  return violations;
}

/** Compares current violation ids with the baseline ids for each locale. */
export function compareWithBaseline(baseline, current) {
  const added = [];
  const fixed = [];
  for (const locale of LOCALES) {
    const before = new Set(baseline[locale] ?? []);
    const now = new Set(current[locale].map((violation) => violation.id));
    for (const violation of current[locale]) {
      if (!before.has(violation.id)) added.push({ locale, ...violation });
    }
    for (const id of [...before].sort()) {
      if (!now.has(id)) fixed.push({ locale, id });
    }
  }
  return { added, fixed };
}

export function buildBaselineDocument(current) {
  return {
    version: BASELINE_VERSION,
    description:
      'Locale families that interpolate {{count}} without full plural forms (GAP-B-14). May only shrink; regenerate with `' +
      UPDATE_COMMAND +
      '`.',
    totals: Object.fromEntries(LOCALES.map((locale) => [locale, current[locale].length])),
    violations: Object.fromEntries(LOCALES.map((locale) => [locale, current[locale].map((v) => v.id).sort()])),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadLocale(localesDir, locale) {
  const dir = join(localesDir, locale);
  const namespaces = {};
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    namespaces[file.replace(/\.json$/, '')] = readJson(join(dir, file));
  }
  return namespaces;
}

function parseArgs(argv) {
  const rootArg = argv.find((arg) => arg.startsWith('--root='));
  return {
    update: argv.includes('--update-baseline'),
    force: argv.includes('--force'),
    root: rootArg ? rootArg.slice('--root='.length) : null,
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const frontendRoot = args.root
    ? resolve(process.cwd(), args.root)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const scriptDir = join(frontendRoot, 'scripts', 'i18n');
  const localesDir = join(frontendRoot, 'src', 'i18n', 'locales');
  const allowlistPath = join(scriptDir, 'plural-allowlist.json');
  const baselinePath = join(scriptDir, 'plural-baseline.json');

  const allowlist = existsSync(allowlistPath) ? readJson(allowlistPath) : {};
  const options = {
    invariantPatterns: compileInvariantPatterns(allowlist),
    exemptKeys: new Set(
      (allowlist.exemptKeys ?? []).map((entry, index) => {
        if (!entry || typeof entry.id !== 'string' || !entry.reason) {
          throw new Error(`plural-allowlist exemptKeys[${index}] requires id (namespace:key) and reason`);
        }
        return entry.id;
      }),
    ),
  };
  const current = Object.fromEntries(
    LOCALES.map((locale) => [locale, findPluralViolations(locale, loadLocale(localesDir, locale), options)]),
  );
  const baseline = existsSync(baselinePath) ? readJson(baselinePath).violations ?? {} : null;
  const { added, fixed } = compareWithBaseline(baseline ?? {}, current);
  const summary = LOCALES.map((locale) => `${locale} ${current[locale].length}`).join(' / ');

  const printAdded = (log) => {
    for (const violation of added) {
      log(`  [${violation.locale}] ${violation.id} is missing _${violation.missing.join(', _')}`);
    }
  };

  if (args.update) {
    if (baseline && added.length > 0 && !args.force) {
      console.error('i18n plural validator: refusing to add violations to the baseline:');
      printAdded(console.error);
      return 1;
    }
    writeFileSync(baselinePath, `${JSON.stringify(buildBaselineDocument(current), null, 2)}\n`, 'utf8');
    console.log(`i18n plural validator: baseline written (${summary}).`);
    return 0;
  }

  if (!baseline) {
    console.error(`i18n plural validator: missing plural-baseline.json. Seed it with \`${UPDATE_COMMAND}\`.`);
    return 1;
  }

  if (added.length > 0) {
    console.error(`i18n plural validator: FAIL (${added.length} new {{count}} strings without plural forms)`);
    printAdded(console.error);
    console.error(
      'Use whole-phrase plural keys: cs needs _one/_few/_other (optional _many), en needs _one/_other (docs/LOCALIZATION.md).',
    );
    return 1;
  }

  console.log(`i18n plural validator: PASS (families without plural forms: ${summary}; baseline may only shrink)`);
  if (fixed.length > 0) {
    console.log(`${fixed.length} baseline entries are fixed; lock them in with \`${UPDATE_COMMAND}\`.`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error('validate-plurals failed:', error);
    process.exitCode = 1;
  }
}
