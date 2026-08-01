#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '../..');
const repositoryRoot = resolve(frontendRoot, '..');
const manifestPath = resolve(repositoryRoot, 'tests/frontend/contracts/dora-e2e-requirements.json');
const disabledTestPattern = /\b(?:test|test\.describe|describe)\.(?:skip|fixme)\s*\(/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertSafeSpecPath(spec) {
  const safe = isNonEmptyString(spec)
    && spec.startsWith('tests/frontend/e2e/')
    && spec.endsWith('.spec.ts')
    && !spec.startsWith('/')
    && !spec.includes('\\')
    && !spec.split('/').includes('..');
  if (!safe) {
    throw new Error(`DORA E2E coverage contract has an unsafe spec path: ${String(spec)}`);
  }
}

function validateManifest(manifest) {
  if (
    !manifest
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || manifest.version !== 1
    || manifest.project !== 'ci'
    || !Array.isArray(manifest.requirements)
    || manifest.requirements.length === 0
  ) {
    throw new Error('DORA E2E coverage contract must use version 1, project ci, and non-empty requirements');
  }

  const requirementIds = new Set();
  for (const requirement of manifest.requirements) {
    if (!requirement || typeof requirement !== 'object' || !isNonEmptyString(requirement.id)) {
      throw new Error('DORA E2E coverage contract requires a non-empty requirement id');
    }
    if (requirementIds.has(requirement.id)) {
      throw new Error(`DORA E2E coverage contract has duplicate requirement id: ${requirement.id}`);
    }
    requirementIds.add(requirement.id);

    if (!isNonEmptyString(requirement.description)) {
      throw new Error(`${requirement.id} requires a non-empty description`);
    }
    if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
      throw new Error(`${requirement.id} requires at least one evidence entry`);
    }

    const evidencePairs = new Set();
    for (const evidence of requirement.evidence) {
      if (!evidence || typeof evidence !== 'object' || !isNonEmptyString(evidence.titleIncludes)) {
        throw new Error(`${requirement.id} has malformed evidence`);
      }
      assertSafeSpecPath(evidence.spec);
      const pair = `${evidence.spec}\0${evidence.titleIncludes}`;
      if (evidencePairs.has(pair)) {
        throw new Error(`${requirement.id} has duplicate evidence: ${evidence.spec} / ${evidence.titleIncludes}`);
      }
      evidencePairs.add(pair);
    }
  }
}

function parseCiCollection(output) {
  return output.split('\n').flatMap((line) => {
    const match = line.match(/^\s*\[ci\]\s+›\s+(.+\.spec\.ts):\d+:\d+\s+›\s+(.+)$/);
    if (!match) return [];
    return [{ spec: `tests/frontend/e2e/${match[1]}`, title: match[2] }];
  });
}

export function validateDoraCoverageContract({
  manifest,
  collectionOutput,
  sources,
  collectionStatus = 0,
}) {
  validateManifest(manifest);

  if (collectionStatus !== 0) {
    throw new Error(`Playwright ci collection failed with exit ${collectionStatus}`);
  }
  if (!(sources instanceof Map)) {
    throw new Error('DORA E2E coverage contract requires a source map');
  }

  for (const requirement of manifest.requirements) {
    for (const evidence of requirement.evidence) {
      if (!sources.has(evidence.spec)) {
        throw new Error(`Missing required spec source: ${evidence.spec}`);
      }
      if (disabledTestPattern.test(sources.get(evidence.spec))) {
        throw new Error(`Required spec contains a skip or fixme annotation: ${evidence.spec}`);
      }
    }
  }

  const collectedTests = parseCiCollection(collectionOutput);
  for (const requirement of manifest.requirements) {
    for (const evidence of requirement.evidence) {
      const matches = collectedTests.filter((test) => (
        test.spec === evidence.spec && test.title.includes(evidence.titleIncludes)
      ));
      if (matches.length !== 1) {
        throw new Error(
          `${requirement.id} evidence "${evidence.titleIncludes}" matched ${matches.length} ci tests`,
        );
      }
    }
  }

  return {
    requirements: manifest.requirements.length,
    evidence: manifest.requirements.reduce((count, requirement) => count + requirement.evidence.length, 0),
    collected: collectedTests.length,
  };
}

function loadRequiredSources(manifest) {
  validateManifest(manifest);
  const specs = new Set(manifest.requirements.flatMap((requirement) => (
    requirement.evidence.map((evidence) => evidence.spec)
  )));
  return new Map([...specs].map((spec) => [spec, readFileSync(resolve(repositoryRoot, spec), 'utf8')]));
}

export function validateDoraE2eCoverage() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sources = loadRequiredSources(manifest);
  const playwright = resolve(frontendRoot, 'node_modules/.bin/playwright');
  const result = spawnSync(
    playwright,
    ['test', '-c', 'playwright.config.ts', '--project=ci', '--list'],
    { cwd: frontendRoot, env: process.env, encoding: 'utf8' },
  );
  const collectionOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const summary = validateDoraCoverageContract({
    manifest,
    collectionOutput,
    sources,
    collectionStatus: result.status,
  });
  console.log(
    `DORA E2E coverage verified: ${summary.requirements} requirements, `
      + `${summary.evidence} evidence entries, ${summary.collected} ci tests collected.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateDoraE2eCoverage();
}
