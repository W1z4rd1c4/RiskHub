#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUIRED_A11Y_SPECS } from './validate-playwright-a11y-collection.mjs';

function visitSuites(suites, callback) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) callback(spec, suite.file);
    visitSuites(suite.suites, callback);
  }
}

export function assertA11ySpecsExecuted(reportOrReports) {
  const reports = Array.isArray(reportOrReports) ? reportOrReports : [reportOrReports];
  const byFile = new Map(REQUIRED_A11Y_SPECS.map((spec) => [spec, []]));
  for (const report of reports) {
    visitSuites(report?.suites, (spec, suiteFile) => {
      const file = basename(spec.file ?? suiteFile ?? '');
      if (byFile.has(file)) byFile.get(file).push(spec);
    });
  }

  for (const [file, specs] of byFile) {
    if (specs.length === 0) throw new Error(`Playwright JSON report contains no tests for ${file}`);
    for (const spec of specs) {
      const tests = (spec.tests ?? []).filter((test) => test.projectName === 'ci');
      if (tests.length === 0) throw new Error(`${file}: ${spec.title} did not execute on project ci`);
      for (const test of tests) {
        const statuses = (test.results ?? []).map((result) => result.status);
        if (test.status === 'skipped' || statuses.length === 0 || !statuses.includes('passed')) {
          throw new Error(`${file}: ${spec.title} was skipped or did not pass (${statuses.join(', ') || 'no result'})`);
        }
      }
    }
  }
}

function main() {
  const reportPaths = process.argv.slice(2);
  if (reportPaths.length === 0) {
    throw new Error('Usage: validate-playwright-a11y-results.mjs <playwright-results.json> [...]');
  }
  const reports = reportPaths.map((reportPath) => (
    JSON.parse(readFileSync(resolve(process.cwd(), reportPath), 'utf8'))
  ));
  assertA11ySpecsExecuted(reports);
  console.log(`Playwright accessibility execution verified: ${REQUIRED_A11Y_SPECS.join(', ')}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
