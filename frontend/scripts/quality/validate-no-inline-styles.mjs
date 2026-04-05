import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(scriptDir, '..', '..');
const root = join(frontendRoot, 'src');
const violations = [];

function collectSourceFiles(currentDir, prefix = '') {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(relativePath);
    }
  }
  return files;
}

for (const relativePath of collectSourceFiles(root)) {
  const absolutePath = join(root, relativePath);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('style={{')) {
      violations.push(`${relativePath}:${index + 1}`);
    }
  });
}

if (violations.length > 0) {
  console.error('Inline React styles are forbidden in frontend/src:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('No inline React styles detected in frontend/src.');
