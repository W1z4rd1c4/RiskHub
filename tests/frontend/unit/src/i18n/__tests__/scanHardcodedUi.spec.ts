import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scannerScript = path.resolve(process.cwd(), 'scripts/i18n/scan-hardcoded-ui.mjs');

const allowlist = {
  pathPatterns: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/__tests__/**',
    '**/test/**',
    '**/*.d.ts',
    'src/i18n/**',
    'src/types/**',
  ],
  tokenPatterns: [
    '^RiskHub$',
    '^CZK$',
    '^EUR$',
    '^DORA$',
    '^GDPR$',
    '^ISO\\s?27001$',
    '^[A-Z0-9_:-]{2,}$',
    '^[-+*/→•|:()\\[\\]{}.,\\s0-9]+$',
  ],
};

type ScopedException = { path: string; text: string; reason: string };

function runScanner(source: string, scopedExceptions?: ScopedException[]) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'riskhub-i18n-scan-'));
  const srcDir = path.join(tmpRoot, 'src', 'components');
  const scriptDir = path.join(tmpRoot, 'scripts', 'i18n');

  mkdirSync(srcDir, { recursive: true });
  mkdirSync(scriptDir, { recursive: true });

  const fixtureAllowlist = scopedExceptions ? { ...allowlist, scopedExceptions } : allowlist;
  writeFileSync(path.join(scriptDir, 'allowlist.json'), `${JSON.stringify(fixtureAllowlist, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(srcDir, 'Probe.tsx'), source, 'utf8');

  const result = spawnSync(process.execPath, [scannerScript], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });

  rmSync(tmpRoot, { recursive: true, force: true });
  return result;
}

describe('scan-hardcoded-ui script regressions', () => {
  it('detects short actionable JSX text', () => {
    const result = runScanner(`
      export function Probe() {
        return <button>Retry</button>;
      }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Retry');
  });

  it('detects native dialog literal usage', () => {
    const result = runScanner(`
      export function Probe() {
        const confirmed = confirm('Are you sure you want to continue?');
        return <div>{String(confirmed)}</div>;
      }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[native-dialog]');
  });

  it('detects native dialog usage even when argument is translated', () => {
    const result = runScanner(`
      export function Probe() {
        const confirmed = confirm(t('common:confirmation.delete_message'));
        return <div>{String(confirmed)}</div>;
      }
      function t(_key: string) { return 'translated'; }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[native-dialog]');
  });

  it('detects JSX fallback literals', () => {
    const result = runScanner(`
      export function Probe({ value }: { value?: string }) {
        return <div>{value || 'Unknown owner'}</div>;
      }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[jsx-fallback]');
  });

  it('detects state setter literals but allows i18n keys', () => {
    const bad = runScanner(`
      import { useState } from 'react';
      export function Probe() {
        const [error, setError] = useState<string | null>(null);
        if (!error) {
          setError('Failed to load preferences');
        }
        return <div>{error}</div>;
      }
    `);

    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('[state-literal]');

    const good = runScanner(`
      import { useState } from 'react';
      export function Probe() {
        const [errorKey, setErrorKey] = useState<string | null>(null);
        if (!errorKey) {
          setErrorKey('errors.load_failed');
        }
        return <div>{errorKey}</div>;
      }
    `);

    expect(good.status).toBe(0);
  });

  it('detects short UI prop literals on placeholders', () => {
    const result = runScanner(`
      export function Probe() {
        return <input placeholder="Type" />;
      }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[prop]');
    expect(result.stderr).toContain('Type');
  });

  it('detects single-word JSX text literals (AX-00 / I18N-02 blind spot)', () => {
    const result = runScanner(`
      export function Probe() {
        return <span>Uncategorised</span>;
      }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[jsx] Uncategorised');
  });

  it('detects single-word labels with a trailing colon and JSX child string literals', () => {
    const result = runScanner(`
      export function Probe({ limit }: { limit: number }) {
        return <p>Limit: {limit} <span>{'Baseline'}</span></p>;
      }
    `);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[jsx] Limit:');
    expect(result.stderr).toContain('[jsx-expr] Baseline');
  });

  it('keeps single-word class names and symbols out of the JSX text check', () => {
    const result = runScanner(`
      export function Probe({ active }: { active: boolean }) {
        return <span className={active ? 'active' : 'inactive'}>{'—'} 42 →</span>;
      }
    `);

    expect(result.status).toBe(0);
  });

  it('honours file-scoped exceptions and fails on stale ones', () => {
    const source = `
      export function Probe() {
        return <span>Risk<b>Hub</b></span>;
      }
    `;
    const brandException = {
      path: 'src/components/Probe.tsx',
      text: 'Risk',
      reason: 'Brand wordmark',
    };

    expect(runScanner(source).status).toBe(1);

    const allowed = runScanner(source.replace('<b>Hub</b>', ''), [brandException]);
    expect(allowed.status).toBe(0);

    const stale = runScanner(`
      export function Probe() {
        return <span>{'—'}</span>;
      }
    `, [brandException]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('Stale allowlist.scopedExceptions');
  });
});
