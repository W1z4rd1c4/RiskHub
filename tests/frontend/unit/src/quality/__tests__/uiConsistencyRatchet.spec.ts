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

  it('counts transition-all (DS-31) but not transition-colors or named properties', () => {
    expect(count('transition-all', 'transition-all hover:transition-all')).toBe(2);
    expect(count('transition-all', 'transition-colors transition-[transform,opacity] transition-allow')).toBe(0);
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

  it('counts animated and aliased bypasses of the element bans (roadmap 4.5)', () => {
    expect(count('raw-button', '<motion.button type="button" onClick={go}>')).toBe(1);
    expect(count('raw-button', "const MotionButton = motion.create('button'); const Old = motion(\"button\");")).toBe(2);
    expect(count('raw-button', '<div role="button" tabIndex={0}> <span role={\'button\'}>')).toBe(2);
    expect(count('raw-button', '<a onClick={() => go()} className="x"> <motion.a onClick={go}>')).toBe(2);
    expect(count('raw-button', '<a href="/x" onClick={track}> <Button onClick={go}>')).toBe(0);
    expect(count('raw-button', "const SELECTOR = 'a, button, [role=\"button\"]';")).toBe(0);
    expect(count('raw-text-input', '<motion.input value={v} /> <motion.textarea />')).toBe(2);
    expect(count('raw-text-input', "motion.create('input')")).toBe(1);
    expect(count('raw-table', "<motion.table> motion.create('table')")).toBe(2);
    expect(count('raw-button', '<motion.button />', 'src/components/ui/button.tsx')).toBe(0);
  });

  it('marks every pattern hard zero except the allowlisted ones, each with a reason', () => {
    const allowlisted = PATTERNS.filter((entry: Pattern) => !entry.hardZero).map((entry: Pattern) => entry.id).sort();
    expect(allowlisted).toEqual(['hex-literal', 'important-css']);
    for (const entry of PATTERNS.filter((candidate: Pattern) => !candidate.hardZero)) {
      for (const reason of Object.values(entry.allowlist ?? {})) {
        expect(String(reason).length).toBeGreaterThan(20);
      }
    }
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

  const HEX_FILE = 'src/hooks/useRiskHubConfig.ts';

  it('fails a hard-zero pattern on any match, whatever the baseline says', () => {
    const result = compareCounts({ 'text-white': { 'src/pages/A.tsx': 5 } }, { 'text-white': { 'src/pages/A.tsx': 1 } });

    expect(result.increases).toEqual([{ pattern: 'text-white', file: 'src/pages/A.tsx', before: 0, after: 1 }]);
    expect(result.unbaselined).toEqual([]);
    expect(result.retired).toEqual(['text-white']);
  });

  it('fails an allowlisted pattern on an increase in its file and on any unlisted file', () => {
    const baseline = { 'hex-literal': { [HEX_FILE]: 1, 'src/pages/Unlisted.tsx': 4 } };
    const current = { 'hex-literal': { [HEX_FILE]: 2, 'src/pages/Unlisted.tsx': 1, 'src/pages/New.tsx': 1 } };
    const result = compareCounts(baseline, current);

    expect(result.increases).toEqual([
      { pattern: 'hex-literal', file: HEX_FILE, before: 1, after: 2 },
      { pattern: 'hex-literal', file: 'src/pages/New.tsx', before: 0, after: 1 },
      { pattern: 'hex-literal', file: 'src/pages/Unlisted.tsx', before: 0, after: 1 },
    ]);
    expect(result.totals['hex-literal']).toEqual({ before: 1, after: 4 });
    expect(formatComparison(result).join('\n')).toContain('src/pages/New.tsx  0 -> 1 (+1)');
  });

  it('reports decreases (including deleted files) without failing', () => {
    const baseline = { 'hex-literal': { [HEX_FILE]: 3 } };
    const result = compareCounts(baseline, { 'hex-literal': { [HEX_FILE]: 1 } });

    expect(result.increases).toEqual([]);
    expect(result.decreases).toEqual([{ pattern: 'hex-literal', file: HEX_FILE, before: 3, after: 1 }]);
    expect(compareCounts(baseline, { 'hex-literal': {} }).decreases).toHaveLength(1);
  });

  it('flags allowlisted patterns without a baseline and drops retired or hard-zero baseline entries', () => {
    const result = compareCounts({ retired: { 'src/x.tsx': 1 }, 'text-white': {} }, { 'hex-literal': {}, 'text-white': {} });
    expect(result.unbaselined).toEqual(['hex-literal']);
    expect(result.retired).toEqual(['retired', 'text-white']);
  });

  it('only lets --update-baseline lower counts unless forced, and never records hard-zero patterns', () => {
    const baseline = { 'hex-literal': { [HEX_FILE]: 1 } };

    const lowered = planBaselineUpdate(baseline, { 'hex-literal': {}, 'text-white': {} });
    expect(lowered.ok).toBe(true);
    expect(lowered.document?.counts['hex-literal']).toEqual({});
    expect(lowered.document?.totals['hex-literal']).toBe(0);
    expect(lowered.document?.counts).not.toHaveProperty('text-white');

    const raised = planBaselineUpdate(baseline, { 'hex-literal': { [HEX_FILE]: 2 } });
    expect(raised.ok).toBe(false);
    expect(raised.document).toBeNull();

    const forced = planBaselineUpdate(baseline, { 'hex-literal': { [HEX_FILE]: 2 } }, { force: true });
    expect(forced.ok).toBe(true);
    expect(forced.document?.counts['hex-literal']).toEqual({ [HEX_FILE]: 2 });
  });
});
