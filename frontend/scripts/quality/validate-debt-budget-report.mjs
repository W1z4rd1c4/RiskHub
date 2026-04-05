import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_REPORT_PATH = path.join(ROOT, '..', 'tests', 'results', 'quality', 'frontend', 'debt-budget', 'debt.json');
const reportPath = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : DEFAULT_REPORT_PATH;

async function main() {
  const raw = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);

  const violations = Array.isArray(report.violations) ? report.violations : [];
  const errors = Array.isArray(report.errors) ? report.errors : [];

  if (violations.length > 0 || errors.length > 0) {
    throw new Error(
      `Debt budget report is failing: violations=${violations.length}, errors=${errors.length}, report=${reportPath}`,
    );
  }

  console.log(`Debt budget validator passed: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
