import { existsSync, readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dirname, '../..');
const distRoot = resolve(frontendRoot, 'dist');
const graphPath = resolve(frontendRoot, '.cache/login-dependency-graph.json');
const deployableGraphPath = resolve(distRoot, 'login-dependency-graph.json');

function validate() {
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const chunks = new Map(graph.chunks.map((chunk) => [chunk.fileName, chunk]));
  const errors = [];

  function findChunk(moduleSuffix, label) {
    const chunk = graph.chunks.find((candidate) => candidate.modules.some((id) => id.endsWith(moduleSuffix)));
    if (!chunk) errors.push(`Missing ${label} chunk (${moduleSuffix}).`);
    return chunk;
  }

  function staticClosure(startChunks) {
    const files = new Set();
    const pending = startChunks.filter(Boolean).map((chunk) => chunk.fileName);
    while (pending.length > 0) {
      const file = pending.pop();
      if (!file || files.has(file)) continue;
      files.add(file);
      const chunk = chunks.get(file);
      if (!chunk) {
        errors.push(`Graph references missing chunk ${file}.`);
        continue;
      }
      pending.push(...chunk.imports);
    }
    return files;
  }

  function modulesFor(files) {
    return [...files].flatMap((file) => chunks.get(file)?.modules ?? []);
  }

  function assertNoMatch(modules, patterns, label) {
    const matches = modules.filter((id) => patterns.some((pattern) => id.includes(pattern)));
    if (matches.length > 0) {
      errors.push(`${label}: ${matches.join(', ')}`);
    }
  }

  function measure(files) {
    return [...files].reduce((total, file) => {
      const bytes = readFileSync(resolve(distRoot, file));
      total.rawBytes += bytes.byteLength;
      total.gzipBytes += gzipSync(bytes).byteLength;
      return total;
    }, { rawBytes: 0, gzipBytes: 0 });
  }

  if (existsSync(deployableGraphPath)) {
    errors.push('The diagnostic login dependency graph must not be written to deployable dist/.');
  }

  const main = graph.chunks.find((chunk) => chunk.isEntry && chunk.facadeModuleId?.endsWith('/index.html'));
  if (!main) errors.push('Missing main index.html entry chunk.');
  const login = findChunk('/src/pages/LoginPage.tsx', 'LoginPage');
  const protectedApp = findChunk('/src/ProtectedApplication.tsx', 'protected application');
  const entra = findChunk('/src/services/entraAuth.ts', 'Entra/MSAL adapter');
  const localeEn = findChunk('/src/i18n/locales/en/index.ts', 'English locale');
  const localeCs = findChunk('/src/i18n/locales/cs/index.ts', 'Czech locale');

  const publicBase = staticClosure([main, login]);
  const protectedPatterns = [
    '/src/ProtectedApplication.tsx',
    '/src/components/layout/MainLayout.tsx',
    '/src/contexts/DashboardFilterContext.tsx',
    '/src/routing/business.tsx',
    '/src/routing/admin.tsx',
  ];
  const ssoPatterns = ['/src/services/entraAuth.ts', '/node_modules/@azure/msal-browser/'];

  assertNoMatch(modulesFor(publicBase), protectedPatterns, 'Cold login statically includes protected application code');
  assertNoMatch(modulesFor(publicBase), ssoPatterns, 'Cold login statically includes Entra/MSAL code');

  const measurements = {};
  for (const [language, activeLocale, inactiveLocale] of [
    ['en', localeEn, '/src/i18n/locales/cs/'],
    ['cs', localeCs, '/src/i18n/locales/en/'],
  ]) {
    const graphFiles = staticClosure([main, login, activeLocale]);
    assertNoMatch(modulesFor(graphFiles), [inactiveLocale], `Cold ${language} login includes the inactive locale`);
    measurements[language] = { ...measure(graphFiles), files: [...graphFiles].sort() };
  }

  if (!protectedApp || !entra || !localeEn || !localeCs) {
    errors.push('Protected application, SSO, and both locales must remain independently loadable chunks.');
  }

  if (errors.length > 0) {
    console.error(JSON.stringify({ ok: false, errors, measurements }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, measurements }, null, 2));
}

try {
  validate();
} finally {
  rmSync(graphPath, { force: true });
}
