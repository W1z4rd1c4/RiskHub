import { describe, expect, it } from 'vitest';

import {
  PATTERNS,
  buildCounts,
  compareCounts,
  countPattern,
  formatComparison,
  isScannedPath,
  planBaselineUpdate,
} from '../../../../../../frontend/scripts/quality/ui-consistency-ratchet.mjs';

type Pattern = (typeof PATTERNS)[number];

function pattern(id: string): Pattern {
  const found = PATTERNS.find((entry: Pattern) => entry.id === id);
  if (!found) throw new Error(`unknown pattern ${id}`);
  return found;
}

const count = (id: string, source: string, file = 'src/pages/Probe.tsx') => countPattern(pattern(id), file, source);

describe('ui-consistency-ratchet patterns', () => {
  it('counts text-white with variants but not alpha or derived tokens', () => {
    expect(count('text-white', 'className="text-white hover:text-white group-hover:text-white"')).toBe(3);
    expect(count('text-white', 'className="text-white/80 text-white-ish bg-white"')).toBe(0);
  });

  it('counts raw palette colours and white/black alpha utilities', () => {
    expect(count('raw-palette', 'className="bg-slate-900 hover:text-rose-400 border-emerald-500/20"')).toBe(3);
    expect(count('raw-palette', 'className="bg-destructive text-success-text"')).toBe(0);
    expect(count('white-alpha', 'className="bg-white/5 border-white/10 divide-white/[0.06] text-black/50"')).toBe(4);
    expect(count('white-alpha', 'className="bg-white border-border"')).toBe(0);
  });

  it('counts sub-11px arbitrary font sizes and font-black only', () => {
    expect(count('micro-font', 'text-[9px] text-[10px] text-[10.5px] text-[11px] text-[12px]')).toBe(3);
    expect(count('font-black', 'font-black md:font-black font-bold')).toBe(2);
  });

  it('bans raw elements outside primitives but not inside them', () => {
    const source = '<button type="button" /> <input value={v} /> <textarea /> <table>';
    expect(count('raw-button', source)).toBe(1);
    expect(count('raw-text-input', source)).toBe(2);
    expect(count('raw-table', source)).toBe(1);
    expect(count('raw-button', source, 'src/components/ui/button.tsx')).toBe(0);
    expect(count('raw-text-input', source, 'src/components/ui/input.tsx')).toBe(0);
    expect(count('raw-table', source, 'src/components/tables/SortableTable.tsx')).toBe(0);
    expect(count('raw-table', source, 'src/components/tables/Pagination.tsx')).toBe(1);
  });

  it('does not count non-text inputs as raw text inputs', () => {
    expect(count('raw-text-input', '<input type="checkbox" /> <input type="hidden" /> <input type="text" />')).toBe(1);
    expect(count('raw-text-input', "<input onChange={(e) => set(e.target.checked)} type={'checkbox'} />")).toBe(0);
    expect(count('raw-text-input', '<input onChange={(e) => set(e.target.value)} type="text" />')).toBe(1);
  });

  it('counts dark: variants but not object keys named dark', () => {
    expect(count('dark-variant', 'className="dark:bg-black dark:!text-white"')).toBe(2);
    expect(count('dark-variant', "const palette = { dark: '#000', light: '#fff' };")).toBe(0);
  });

  it('counts style props, btn classes and pill recipes', () => {
    expect(count('inline-style', '<div style={{ width: 4 }} /><div style={styles} />')).toBe(2);
    expect(count('btn-classes', 'className="btn-primary" className="btn-secondary btn-ghost"')).toBe(2);
    expect(count('pill-inline', '<span className="px-2 py-0.5 text-xs">\n<span className="px-2 py-0.5 text-sm">')).toBe(1);
    expect(count('pill-inline', '<span className="px-2 py-0.5 text-[10px] font-bold">')).toBe(1);
    expect(count('pill-inline', '<span className="px-2 py-0.5 text-xs-tight">')).toBe(0);
  });

  it('counts !important only in CSS and source patterns only in TS/TSX', () => {
    expect(countPattern(pattern('important-css'), 'src/index.css', 'a { color: red !important; }')).toBe(1);
    expect(countPattern(pattern('important-css'), 'src/pages/Probe.tsx', "'!important'")).toBe(0);
    expect(countPattern(pattern('text-white'), 'src/index.css', '.x { @apply text-white; }')).toBe(0);
  });

  it('excludes tests from the scan', () => {
    expect(isScannedPath('src/pages/Probe.tsx')).toBe(true);
    expect(isScannedPath('src/index.css')).toBe(true);
    expect(isScannedPath('src/pages/Probe.test.tsx')).toBe(false);
    expect(isScannedPath('src/pages/__tests__/Probe.tsx')).toBe(false);
    expect(isScannedPath('src/pages/data.json')).toBe(false);
  });
});

describe('ui-consistency-ratchet comparison', () => {
  const files = [
    { path: 'src/pages/A.tsx', source: '<p className="text-white bg-white/5" />' },
    { path: 'src/pages/B.tsx', source: '<p className="text-foreground" />' },
    { path: 'src/pages/A.test.tsx', source: '<p className="text-white" />' },
  ];

  it('builds per-pattern, per-file counts and omits zero counts', () => {
    const counts = buildCounts(files);
    expect(counts['text-white']).toEqual({ 'src/pages/A.tsx': 1 });
    expect(counts['white-alpha']).toEqual({ 'src/pages/A.tsx': 1 });
    expect(counts['raw-button']).toEqual({});
  });

  it('fails on an increase in a known file and on a new file with debt', () => {
    const baseline = { 'text-white': { 'src/pages/A.tsx': 1 } };
    const current = { 'text-white': { 'src/pages/A.tsx': 2, 'src/pages/New.tsx': 1 } };
    const result = compareCounts(baseline, current);

    expect(result.increases).toEqual([
      { pattern: 'text-white', file: 'src/pages/A.tsx', before: 1, after: 2 },
      { pattern: 'text-white', file: 'src/pages/New.tsx', before: 0, after: 1 },
    ]);
    expect(result.totals['text-white']).toEqual({ before: 1, after: 3 });
    expect(formatComparison(result).join('\n')).toContain('src/pages/New.tsx  0 -> 1 (+1)');
  });

  it('reports decreases (including deleted files) without failing', () => {
    const baseline = { 'text-white': { 'src/pages/A.tsx': 3, 'src/pages/Gone.tsx': 2 } };
    const current = { 'text-white': { 'src/pages/A.tsx': 1 } };
    const result = compareCounts(baseline, current);

    expect(result.increases).toEqual([]);
    expect(result.decreases).toHaveLength(2);
    expect(result.totals['text-white']).toEqual({ before: 5, after: 1 });
  });

  it('flags patterns that have no baseline and baseline patterns that were retired', () => {
    const result = compareCounts({ retired: { 'src/x.tsx': 1 } }, { 'text-white': {} });
    expect(result.unbaselined).toEqual(['text-white']);
    expect(result.retired).toEqual(['retired']);
  });

  it('only lets --update-baseline lower counts unless forced', () => {
    const baseline = { 'text-white': { 'src/pages/A.tsx': 1 } };

    const lowered = planBaselineUpdate(baseline, { 'text-white': {} });
    expect(lowered.ok).toBe(true);
    expect(lowered.document?.counts['text-white']).toEqual({});
    expect(lowered.document?.totals['text-white']).toBe(0);

    const raised = planBaselineUpdate(baseline, { 'text-white': { 'src/pages/A.tsx': 2 } });
    expect(raised.ok).toBe(false);
    expect(raised.document).toBeNull();

    const forced = planBaselineUpdate(baseline, { 'text-white': { 'src/pages/A.tsx': 2 } }, { force: true });
    expect(forced.ok).toBe(true);
    expect(forced.document?.counts['text-white']).toEqual({ 'src/pages/A.tsx': 2 });
  });
});
