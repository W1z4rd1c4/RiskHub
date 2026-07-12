import { describe, expect, it } from 'vitest';

import * as axeBaseline from '../../../e2e/helpers/axeBaseline';

/**
 * Commit R2 · Deliverable 2 — zero-tolerance axe: the update/overwrite path is GONE.
 *
 * The axe baseline reached its terminal shrink-only state (every cell []), so the
 * capture/update seam was removed entirely. Previously `isUpdateMode` could flip on
 * Playwright's "missing" default and re-record the ledger; now the helper ENFORCES
 * only — any axe finding on any scanned state is a hard failure. These tests pin
 * that the update surface no longer exists and that an empty cell reports every
 * finding as NEW drift (i.e. the smoke requires zero directly).
 */

describe('axe helper is enforce-only (no update/overwrite surface)', () => {
  it('exposes no capture or update-mode export', () => {
    for (const removed of ['updateBaselineCell', 'isUpdateMode', 'isAxeBaselineUpdateMode'] as const) {
      expect(Object.prototype.hasOwnProperty.call(axeBaseline, removed)).toBe(false);
    }
  });

  it('still exposes the enforce-only surface', () => {
    for (const kept of ['fingerprint', 'toFindings', 'loadBaselineCell', 'diffCell'] as const) {
      expect(typeof axeBaseline[kept]).toBe('function');
    }
  });
});

describe('diffCell enforces zero tolerance against the empty baseline', () => {
  const finding: axeBaseline.AxeFinding = {
    rule: 'color-contrast',
    selector: JSON.stringify(['#x']),
    help: 'Elements must have sufficient color contrast',
    impact: 'serious',
  };

  it('reports every finding as NEW drift against an empty cell', () => {
    const diff = axeBaseline.diffCell('/', [], [finding]);
    expect(diff.newFindings).toEqual([finding]);
    expect(diff.staleFingerprints).toEqual([]);
  });

  it('an empty cell with zero findings has no drift', () => {
    const diff = axeBaseline.diffCell('/', [], []);
    expect(diff.newFindings).toEqual([]);
    expect(diff.staleFingerprints).toEqual([]);
  });
});
