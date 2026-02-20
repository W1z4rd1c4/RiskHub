import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const debtScript = path.resolve(process.cwd(), 'scripts/quality/debt-budget.mjs');

type FixtureOptions = {
  source: string;
      allowlist?: {
        exceptions: Array<{
          rule: string;
          file: string;
          line: number;
          owner: string;
          issue: string;
          expiresOn: string;
          reason: string;
        }>;
      };
};

function runDebtBudgetFixture(options: FixtureOptions) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'riskhub-debt-budget-'));
  const srcDir = path.join(tmpRoot, 'src', 'components');
  const qualityDir = path.join(tmpRoot, 'scripts', 'quality');

  mkdirSync(srcDir, { recursive: true });
  mkdirSync(qualityDir, { recursive: true });

  writeFileSync(path.join(srcDir, 'Probe.tsx'), options.source, 'utf8');
  writeFileSync(
    path.join(qualityDir, 'debt-allowlist.json'),
    `${JSON.stringify(options.allowlist ?? { exceptions: [] }, null, 2)}\n`,
    'utf8',
  );

  const result = spawnSync(process.execPath, [debtScript], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });

  rmSync(tmpRoot, { recursive: true, force: true });
  return result;
}

describe('debt-budget script', () => {
  it('fails on explicit any in frontend/src', () => {
    const result = runDebtBudgetFixture({
      source: `
        export function Probe(payload: any) {
          return <div>{String(payload)}</div>;
        }
      `,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[explicit-any]');
  });

  it('allows explicit any only when a valid allowlist entry exists', () => {
    const result = runDebtBudgetFixture({
      source: `
        export function Probe(payload: any) {
          return <div>{String(payload)}</div>;
        }
      `,
      allowlist: {
        exceptions: [
          {
            rule: 'explicit-any',
            file: 'src/components/Probe.tsx',
            line: 2,
            owner: 'frontend',
            issue: 'RH-1234',
            expiresOn: '2099-01-01',
            reason: 'Boundary adapter until typed API lands',
          },
        ],
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Debt budget passed');
  });

  it('fails when allowlist entry is expired', () => {
    const result = runDebtBudgetFixture({
      source: `
        export function Probe(payload: any) {
          return <div>{String(payload)}</div>;
        }
      `,
      allowlist: {
        exceptions: [
          {
            rule: 'explicit-any',
            file: 'src/components/Probe.tsx',
            line: 2,
            owner: 'frontend',
            issue: 'RH-9',
            expiresOn: '2000-01-01',
            reason: 'Expired temporary allowance',
          },
        ],
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('allowlist entry expired');
  });

  it('fails on disallowed suppression directives', () => {
    const result = runDebtBudgetFixture({
      source: `
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        export function Probe(value: any) {
          // @ts-ignore temporary
          return <div>{String(value)}</div>;
        }
      `,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[eslint-disable]');
    expect(result.stderr).toContain('[ts-directive]');
    expect(result.stderr).toContain('[no-explicit-any-suppression]');
  });

  it('fails on production TODO/FIXME/HACK/XXX debt markers', () => {
    const result = runDebtBudgetFixture({
      source: `
        export function Probe() {
          // TODO remove this temporary fallback
          return <div>ok</div>;
        }
      `,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[comment-debt-marker]');
    expect(result.stderr).toContain('TODO');
  });
});
