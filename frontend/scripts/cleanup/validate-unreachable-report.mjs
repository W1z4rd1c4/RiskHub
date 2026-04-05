import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_REPORT_PATH = path.join(ROOT, '..', 'tests', 'results', 'quality', 'frontend', 'cleanup-audit', 'unreachable.json');
const reportPath = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : DEFAULT_REPORT_PATH;

async function main() {
  const raw = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);
  const records = Array.isArray(report) ? report : [];

  if (records.length > 0) {
    throw new Error(`Cleanup audit found ${records.length} unreachable modules in ${reportPath}`);
  }

  console.log(`Cleanup audit validator passed: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
