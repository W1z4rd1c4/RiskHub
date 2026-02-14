import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const cleanupScript = path.resolve(process.cwd(), 'scripts/cleanup/find-unreachable-modules.mjs');

function runCleanupFixture() {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'riskhub-cleanup-audit-'));
  const srcDir = path.join(tmpRoot, 'src');
  const pagesDir = path.join(srcDir, 'pages');
  const layoutDir = path.join(srcDir, 'components', 'layout');

  mkdirSync(pagesDir, { recursive: true });
  mkdirSync(layoutDir, { recursive: true });

  writeFileSync(path.join(srcDir, 'main.tsx'), "import App from './App';\nvoid App;\n", 'utf8');
  writeFileSync(
    path.join(srcDir, 'App.tsx'),
    [
      "import { MainLayout } from '@/components/layout';",
      "import { DashboardPage } from '@/pages';",
      "export default function App() {",
      '  MainLayout({ children: null });',
      '  return DashboardPage();',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    path.join(pagesDir, 'index.ts'),
    [
      "export { DashboardPage } from './DashboardPage';",
      "export { DirectoryEmulatorPage } from './DirectoryEmulatorPage';",
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(path.join(pagesDir, 'DashboardPage.tsx'), 'export function DashboardPage() { return null; }\n', 'utf8');
  writeFileSync(path.join(pagesDir, 'DirectoryEmulatorPage.tsx'), 'export function DirectoryEmulatorPage() { return null; }\n', 'utf8');
  writeFileSync(path.join(layoutDir, 'index.ts'), "export { MainLayout } from './MainLayout';\n", 'utf8');
  writeFileSync(path.join(layoutDir, 'MainLayout.tsx'), 'export function MainLayout(_: { children: unknown }) { return null; }\n', 'utf8');

  const result = spawnSync(process.execPath, [cleanupScript], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });

  const unreachablePath = path.join(tmpRoot, 'cleanup-audit', 'unreachable.json');
  const dormantPath = path.join(tmpRoot, 'cleanup-audit', 'dormant.md');
  const unreachable = JSON.parse(readFileSync(unreachablePath, 'utf8')) as Array<{ file: string }>;
  const dormant = readFileSync(dormantPath, 'utf8');

  rmSync(tmpRoot, { recursive: true, force: true });
  return { result, unreachable, dormant };
}

describe('cleanup dead-code script regressions', () => {
  it('treats pages barrel symbol imports as reachable', () => {
    const { result, unreachable } = runCleanupFixture();
    expect(result.status).toBe(0);
    expect(unreachable.some((record) => record.file === 'src/pages/DashboardPage.tsx')).toBe(false);
  });

  it('treats directory index imports as reachable runtime edges', () => {
    const { unreachable } = runCleanupFixture();
    expect(unreachable.some((record) => record.file === 'src/components/layout/index.ts')).toBe(false);
    expect(unreachable.some((record) => record.file === 'src/components/layout/MainLayout.tsx')).toBe(false);
  });

  it('keeps dormant page reporting for non-routed exports', () => {
    const { dormant } = runCleanupFixture();
    expect(dormant).toContain('DirectoryEmulatorPage');
    expect(dormant).not.toContain('DashboardPage');
  });
});
