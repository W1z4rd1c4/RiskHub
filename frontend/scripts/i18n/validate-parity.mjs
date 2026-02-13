import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const EN_DIR = path.join(ROOT, 'src', 'i18n', 'locales', 'en');
const CS_DIR = path.join(ROOT, 'src', 'i18n', 'locales', 'cs');

function flattenKeys(obj, prefix = '') {
  const out = new Set();
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const child of flattenKeys(v, key)) out.add(child);
      } else {
        out.add(key);
      }
    }
  }
  return out;
}

function diff(base, other) {
  return [...base].filter((k) => !other.has(k));
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function listJson(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort();
}

async function main() {
  const [enFiles, csFiles] = await Promise.all([listJson(EN_DIR), listJson(CS_DIR)]);

  const enSet = new Set(enFiles);
  const csSet = new Set(csFiles);
  const missingInCsFiles = enFiles.filter((f) => !csSet.has(f));
  const missingInEnFiles = csFiles.filter((f) => !enSet.has(f));

  let hasErrors = false;

  if (missingInCsFiles.length || missingInEnFiles.length) {
    hasErrors = true;
    console.error('i18n parity failed: namespace file mismatch');
    if (missingInCsFiles.length) {
      console.error(`  Missing in cs: ${missingInCsFiles.join(', ')}`);
    }
    if (missingInEnFiles.length) {
      console.error(`  Missing in en: ${missingInEnFiles.join(', ')}`);
    }
  }

  const shared = enFiles.filter((f) => csSet.has(f));

  for (const file of shared) {
    const enPath = path.join(EN_DIR, file);
    const csPath = path.join(CS_DIR, file);
    const [enJson, csJson] = await Promise.all([readJson(enPath), readJson(csPath)]);

    const enKeys = flattenKeys(enJson);
    const csKeys = flattenKeys(csJson);

    const missingInCs = diff(enKeys, csKeys);
    const missingInEn = diff(csKeys, enKeys);

    if (missingInCs.length || missingInEn.length) {
      hasErrors = true;
      console.error(`i18n parity failed in ${file}`);
      if (missingInCs.length) {
        console.error(`  Missing in cs (${missingInCs.length}):`);
        missingInCs.slice(0, 100).forEach((k) => console.error(`    - ${k}`));
      }
      if (missingInEn.length) {
        console.error(`  Missing in en (${missingInEn.length}):`);
        missingInEn.slice(0, 100).forEach((k) => console.error(`    - ${k}`));
      }
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`i18n parity OK across ${shared.length} namespaces.`);
}

main().catch((err) => {
  console.error('validate-parity failed:', err);
  process.exit(1);
});
