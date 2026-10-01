import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildIctCommitteePresentation } from '@/pages/ictRegisterCommittee/buildIctCommitteePresentation';
import type { IctCommittee } from '@/types/ictRegisterCommittee';

/**
 * FR-P5-1 (spec N20, ADR-015) + D1 (ADR-015 Addendum 1) — the Committee status
 * pills take their colours from the severity SSOT (`lib/severity.ts` /
 * `lib/tones.ts` fill recipes) and must clear WCAG AA text contrast (≥ 4.5:1)
 * in every theme.
 *
 * Two things are asserted:
 *  1. The mapping — each verbatim label resolves to the expected token: the
 *     net risk band is the 4-step D1 scale (`success` / `warning` /
 *     `severity-high` / `destructive`), tolerance is a RAG outcome, and the
 *     vendor tier is TierDod (critical → destructive, significant → warning,
 *     standard → neutral `muted`, PM-3).
 *  2. Contrast — each pill's background / foreground pair, resolved against the
 *     actual token values PARSED from index.css, clears 4.5:1 in the default /
 *     dark / light themes.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const indexCss = readFileSync(resolve(repoRoot, 'frontend/src/index.css'), 'utf8');

type Hsl = [number, number, number];
type Rgb = [number, number, number];

const AA_TEXT = 4.5;

/** Background and text token of a fill class recipe (`bg-<token> text-<token>-foreground`). */
function pillTokens(className: string): { bg: string; fg: string } {
    const bg = className.match(/(?:^|\s)bg-([\w-]+)(?=\s|$)/)?.[1];
    const fg = className.match(/(?:^|\s)text-([\w-]+)(?=\s|$)/)?.[1];
    if (!bg || !fg) throw new Error(`Not a token fill recipe: "${className}"`);
    return { bg, fg };
}

/** Every declaration body of the rule blocks for `selector`, joined. */
function themeBlock(css: string, selector: string): string {
    const re = new RegExp(`(?:^|[\\s,])${selector}\\s*\\{([^{}]*)\\}`, 'g');
    const bodies = [...css.matchAll(re)].map((m) => m[1] ?? '');
    const block = bodies.join('\n');
    if (!block.includes('--success')) throw new Error(`No status-token block for "${selector}"`);
    return block;
}

function readHsl(block: string, token: string): Hsl {
    const m = block.match(new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
    if (!m) throw new Error(`Missing --${token}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
    const sat = s / 100;
    const lig = l / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lig - c / 2;
    let base: Rgb;
    if (h < 60) base = [c, x, 0];
    else if (h < 120) base = [x, c, 0];
    else if (h < 180) base = [0, c, x];
    else if (h < 240) base = [0, x, c];
    else if (h < 300) base = [x, 0, c];
    else base = [c, 0, x];
    return [(base[0] + m) * 255, (base[1] + m) * 255, (base[2] + m) * 255];
}

function resolveRgb(token: string, block: string): Rgb {
    return hslToRgb(readHsl(block, token));
}

function relativeLuminance([r, g, b]: Rgb): number {
    const channel = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [
    { name: 'default (:root)', selector: ':root' },
    { name: 'dark (.theme-dark)', selector: '\\.theme-dark' },
    { name: 'light (.theme-light)', selector: '\\.theme-light' },
] as const;

const presentation = buildIctCommitteePresentation(
    {
        dashboard: {
            register_state: {
                process_count: 0,
                asset_count: 0,
                process_asset_link_count: 0,
                vendor_count: 0,
                assets_pending_review_count: 0,
                direct_process_vendor_link_count: 0,
                contracts_in_roi_scope_count: 0,
                sub_outsourcing_link_count: 0,
                assets_without_data_classification_count: 0,
                top_tier_vendors_without_orderly_exit_count: 0,
            },
            key_metrics: {
                cif_process_count: 0,
                processes_without_impact_assessment_count: 0,
                critical_asset_count: 0,
                critical_vendor_count: 0,
                risks_above_tolerance_count: 0,
                open_dq_finding_count: 0,
            },
        },
        cro: {
            kpi: {
                risk_count: 0,
                material_risk_count: 0,
                risks_above_tolerance_count: 0,
                accepted_above_tolerance_count: 0,
                cif_without_bcm_count: 0,
                open_dq_finding_count: 0,
            },
            heatmap: { rows: [] },
            migration_matrix: { rows: [] },
            top_risks: ['Nízké', 'Střední', 'Vysoké', 'Kritické'].flatMap((band, bandIndex) =>
                ['V toleranci', 'NAD TOLERANCI'].map((tolerance, toleranceIndex) => ({
                    rank: bandIndex * 2 + toleranceIndex + 1,
                    risk_id: bandIndex * 2 + toleranceIndex + 1,
                    code: `R-${bandIndex}-${toleranceIndex}`,
                    subject_label: null,
                    threat_label: null,
                    gross_score: null,
                    net_score: null,
                    net_band: band,
                    vs_tolerance: tolerance,
                    status_label: null,
                })),
            ),
            top_vendors: ['Standardní dodavatel', 'Významný dodavatel', 'Kritický dodavatel'].map((tier, index) => ({
                rank: index + 1,
                vendor_id: index + 1,
                name: `Vendor ${index + 1}`,
                cif_process_count: 0,
                tier,
            })),
            narratives: {
                cif_process_count: 0,
                process_count: 0,
                cif_with_bcm_count: 0,
                critical_vendor_count: 0,
                critical_vendors_with_functional_exit_count: 0,
                critical_vendors_with_identifier_count: 0,
                tolerance: 0,
                risks_above_tolerance_count: 0,
                accepted_above_tolerance_count: 0,
                sub_outsourcing_link_count: 0,
                vendors_in_sub_role_count: 0,
            },
            assets_by_criticality: [],
            risks_by_band: [],
        },
        roi_readiness: { templates: [], overall_readiness_pct: null, total_gap_row_count: 0 },
    } satisfies IctCommittee,
    { language: 'en', t: (key) => key },
);

function bandClass(band: string) {
    const index = ['Nízké', 'Střední', 'Vysoké', 'Kritické'].indexOf(band);
    return presentation.executiveSummary.topRisks[index * 2].netBandClass!;
}

function toleranceClass(tolerance: string) {
    return presentation.executiveSummary.topRisks[tolerance === 'V toleranci' ? 0 : 1].toleranceClass!;
}

function tierClass(tier: string) {
    const index = ['Standardní dodavatel', 'Významný dodavatel', 'Kritický dodavatel'].indexOf(tier);
    return presentation.executiveSummary.topVendors[index].tierClass!;
}

// Distinct pill recipes the three helpers resolve to.
const PILLS = [
    { name: 'success (green)', className: bandClass('Nízké') },
    { name: 'warning (amber)', className: bandClass('Střední') },
    { name: 'severity-high (orange)', className: bandClass('Vysoké') },
    { name: 'destructive (red)', className: bandClass('Kritické') },
    { name: 'neutral (muted)', className: tierClass('Standardní dodavatel') },
] as const;

describe('committee status pills — severity SSOT mapping (FR-P5-1, D1)', () => {
    it('maps the four net risk bands onto the D1 4-step scale', () => {
        expect(pillTokens(bandClass('Nízké')).bg).toBe('success');
        expect(pillTokens(bandClass('Střední')).bg).toBe('warning');
        expect(pillTokens(bandClass('Vysoké')).bg).toBe('severity-high');
        expect(pillTokens(bandClass('Kritické')).bg).toBe('destructive');
    });

    it('maps tolerance (RAG) and vendor-tier (TierDod, standard = neutral) pills onto the same tokens', () => {
        expect(pillTokens(toleranceClass('V toleranci')).bg).toBe('success');
        expect(pillTokens(toleranceClass('NAD TOLERANCI')).bg).toBe('destructive');
        expect(pillTokens(tierClass('Standardní dodavatel')).bg).toBe('muted');
        expect(pillTokens(tierClass('Významný dodavatel')).bg).toBe('warning');
        expect(pillTokens(tierClass('Kritický dodavatel')).bg).toBe('destructive');
    });

    it('pairs every pill background with the matching token foreground', () => {
        for (const { className } of PILLS) {
            const { bg, fg } = pillTokens(className);
            expect(fg).toBe(`${bg}-foreground`);
        }
    });
});

describe('committee status pills — WCAG AA text contrast in every theme (FR-P5-1, N20)', () => {
    const cases = THEMES.flatMap(({ name, selector }) =>
        PILLS.map((pill) => ({ theme: name, selector, ...pill })),
    );

    it.each(cases)('$name pill clears AA text (4.5:1) in $theme', ({ selector, className, theme, name }) => {
        const block = themeBlock(indexCss, selector);
        const tokens = pillTokens(className);
        const bg = resolveRgb(tokens.bg, block);
        const fg = resolveRgb(tokens.fg, block);
        const ratio = contrast(bg, fg);
        expect(
            ratio,
            `${name} bg/fg @ ${theme} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
    });
});
