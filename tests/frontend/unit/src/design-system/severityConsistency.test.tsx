import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import * as criticalityPillModule from '@/components/ict-register/CriticalityClassPill';
import { CriticalityClassPill, VendorTierPill } from '@/components/ict-register/CriticalityClassPill';
import * as issueUiModule from '@/components/issues/issueUi';
import { issueSeverityClass } from '@/components/issues/issueUi';
import type { Theme } from '@/contexts/ThemeContext';
import * as useChartThemeModule from '@/hooks/useChartTheme';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import * as useStatusThemeModule from '@/hooks/useStatusTheme';
import { useStatusTheme } from '@/hooks/useStatusTheme';
import * as monitoringStatusModule from '@/lib/monitoringStatus';
import { riskHubKeys } from '@/lib/queryKeys';
import * as riskScoreTheme from '@/lib/riskScoreTheme';
import * as severityModule from '@/lib/severity';
import {
    classifyRiskScore,
    CRITICALITY_CLASS_BAND,
    CRITICALITY_CLASS_TONE,
    CRITICALITY_CLASSES,
    criticalityClass,
    ISSUE_SEVERITY_BAND,
    riskScoreVariantClass,
    SEVERITY_BAND_TONE,
    SEVERITY_BANDS,
    type SeverityBand,
    severityChartColor,
    severityChartToken,
    severityClass,
    VENDOR_TIER_TONE,
    VENDOR_TIERS,
    vendorTierClass,
} from '@/lib/severity';
import * as tonesModule from '@/lib/tones';
import { TONE_CSS_VAR, TONE_VARIANTS, type Tone, toneClass } from '@/lib/tones';
import type { IssueSeverity } from '@/types/issue';
import { createTestQueryClient } from '@test/queryClient';

/**
 * D1 / ADR-015 Addendum 1 / ADR-008 — one severity scale.
 *
 * 1. Every severity mapping derives from `lib/severity.ts` (band → tone) and
 *    `lib/tones.ts` (tone → classes), and each band only ever references its
 *    own token family: low `success`, medium `warning`, high `severity-high`,
 *    critical `destructive`. Blue (`info` / `accent`) never encodes severity.
 * 2. Risk-score bands come from the configured thresholds, never literals.
 * 3. Ratchet: the legacy adapters that still render their own palette are
 *    listed explicitly. Migrating one (roadmap 2.11) makes this test fail until
 *    it is removed from `PENDING_MIGRATION`; a new divergent adapter fails too.
 */

const themeState = vi.hoisted(() => ({ theme: 'riskhub' as Theme }));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: themeState.theme }),
}));

const THEMES: Theme[] = ['riskhub', 'dark', 'light'];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

/** Token families each tone may reference (`text-accent-text` is the info text token). */
const TONE_FAMILIES: Record<Tone, readonly string[]> = {
    neutral: ['muted', 'border'],
    info: ['info', 'accent'],
    success: ['success'],
    warning: ['warning'],
    'severity-high': ['severity-high'],
    danger: ['destructive'],
    accent: ['accent'],
};
const TOKEN_FAMILIES = new Set(Object.values(TONE_FAMILIES).flat());
const RAW_PALETTE =
    /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?$/;
const COLOUR_UTILITY = /^(?:bg|text|border|ring|accent|fill|stroke|outline|divide|shadow)-(.+)$/;

/** Colour families a class string references: token families, or `raw:<hue>` for raw palette. */
function colourFamilies(className: string): Set<string> {
    const families = new Set<string>();
    for (const token of className.split(/\s+/).filter(Boolean)) {
        const utility = (token.split(':').pop() ?? '').replace(/\/[\w.[\]]+$/, '');
        const match = COLOUR_UTILITY.exec(utility);
        if (!match?.[1]) continue;
        const name = match[1];
        if (RAW_PALETTE.test(name)) {
            families.add(`raw:${name.replace(/-\d+$/, '')}`);
            continue;
        }
        const family = name.replace(/-(?:text|foreground)$/, '');
        if (TOKEN_FAMILIES.has(family)) families.add(family);
    }
    return families;
}

function conformsToTone(className: string, tone: Tone): boolean {
    const families = colourFamilies(className);
    return families.size > 0 && [...families].every((family) => TONE_FAMILIES[tone].includes(family));
}

function renderedClass(ui: ReactElement): string {
    const { container, unmount } = render(ui);
    const className = container.firstElementChild?.className ?? '';
    unmount();
    return className;
}

describe('severity consistency — D1 scale', () => {
    it('maps the four bands onto success, warning, severity-high and danger', () => {
        expect(SEVERITY_BAND_TONE).toEqual({
            low: 'success',
            medium: 'warning',
            high: 'severity-high',
            critical: 'danger',
        });
    });

    it.each(SEVERITY_BANDS)('derives every %s recipe from its tone and token family only', (band) => {
        const tone = SEVERITY_BAND_TONE[band];
        for (const variant of TONE_VARIANTS) {
            const value = severityClass(variant, band);
            expect(value).toBe(toneClass(tone, variant));
            expect(conformsToTone(value, tone)).toBe(true);
            expect([...colourFamilies(value)]).not.toContain('info');
            expect([...colourFamilies(value)]).not.toContain('accent');
        }
    });

    it('gives each band its own token family (no two bands share a colour)', () => {
        const families = SEVERITY_BANDS.map((band) => TONE_FAMILIES[SEVERITY_BAND_TONE[band]].join());
        expect(new Set(families).size).toBe(SEVERITY_BANDS.length);
    });

    it('maps issue severity one-to-one onto the bands', () => {
        const severities: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];
        expect(Object.keys(ISSUE_SEVERITY_BAND).sort()).toEqual([...severities].sort());
        for (const severity of severities) {
            expect(ISSUE_SEVERITY_BAND[severity]).toBe(severity);
        }
    });

    it('sources the DORA criticality 3-step scale from the same band tones', () => {
        for (const criticality of CRITICALITY_CLASSES) {
            expect(CRITICALITY_CLASS_TONE[criticality]).toBe(
                SEVERITY_BAND_TONE[CRITICALITY_CLASS_BAND[criticality]],
            );
            expect(criticalityClass('fill', criticality)).toBe(
                toneClass(CRITICALITY_CLASS_TONE[criticality], 'fill'),
            );
        }
        expect(new Set(Object.values(CRITICALITY_CLASS_TONE)).size).toBe(3);
        expect(CRITICALITY_CLASS_TONE.high).toBe(CRITICALITY_CLASS_TONE.medium);
    });

    it('sources vendor tiers from the band tones, with standard as neutral', () => {
        expect(VENDOR_TIER_TONE).toEqual({
            critical: SEVERITY_BAND_TONE.critical,
            significant: SEVERITY_BAND_TONE.medium,
            standard: 'neutral',
        });
        for (const tier of VENDOR_TIERS) {
            expect(vendorTierClass('badge', tier)).toBe(toneClass(VENDOR_TIER_TONE[tier], 'badge'));
        }
    });

    it('colours charts from the band token, declared in index.css and wired in Tailwind', () => {
        const indexCss = readSource('frontend/src/index.css');
        const tailwindConfig = readSource('frontend/tailwind.config.js');
        for (const band of SEVERITY_BANDS) {
            const token = severityChartToken(band);
            expect(token).toBe(TONE_CSS_VAR[SEVERITY_BAND_TONE[band]]);
            expect(indexCss).toMatch(new RegExp(`${token}\\s*:`));
            expect(tailwindConfig).toContain(`var(${token})`);
        }
    });
});

describe('severity consistency — no ambiguous same-named exports', () => {
    /*
     * A legacy theme module may re-export a name from lib/severity.ts or
     * lib/tones.ts only as the identical binding, so an auto-import can never
     * pick a same-named helper with a different palette (the pre-D1
     * score helper is `riskScoreTheme.legacyRiskScoreVariantClass`).
     */
    const canonical: Record<string, unknown> = { ...tonesModule, ...severityModule };
    const legacyModules: Record<string, Record<string, unknown>> = {
        'lib/riskScoreTheme': riskScoreTheme,
        'lib/monitoringStatus': monitoringStatusModule,
        'components/issues/issueUi': issueUiModule,
        'components/ict-register/CriticalityClassPill': criticalityPillModule,
        'hooks/useStatusTheme': useStatusThemeModule,
        'hooks/useChartTheme': useChartThemeModule,
    };

    it.each(Object.entries(legacyModules))('%s shares no export name with a different value', (_name, legacy) => {
        for (const exportName of Object.keys(legacy).filter((key) => key in canonical)) {
            expect(legacy[exportName], exportName).toBe(canonical[exportName]);
        }
    });

    it('keeps the pre-D1 risk-score helper under its legacy name only', () => {
        expect(Object.keys(riskScoreTheme)).not.toContain('riskScoreVariantClass');
        expect(Object.keys(riskScoreTheme)).toContain('legacyRiskScoreVariantClass');
    });
});

describe('severity consistency — thresholds come from configuration (ADR-008)', () => {
    const configured = { critical: 19, high: 11, medium: 4 };

    it('classifies scores without any literal cut-off', () => {
        expect(classifyRiskScore.toString()).not.toMatch(/\d/);
        const severitySource = readSource('frontend/src/lib/severity.ts');
        expect(severitySource).not.toMatch(/\b(?:score|net_score|gross_score|risk_score)\s*[<>]=?\s*\d/);
    });

    it('keeps riskScoreTheme on the same classifier', () => {
        expect(riskScoreTheme.classifyRiskScore).toBe(classifyRiskScore);
    });

    it('follows non-default thresholds end to end', () => {
        expect(classifyRiskScore(18, configured)).toBe('high');
        expect(classifyRiskScore(19, configured)).toBe('critical');
        expect(riskScoreVariantClass('badge', 4, configured)).toBe(severityClass('badge', 'medium'));
    });

    it('binds useRiskThresholds().getSeverityBand to the configured thresholds', () => {
        const queryClient = createTestQueryClient();
        queryClient.setQueryData(riskHubKeys.thresholdsPublic(), configured);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(() => useRiskThresholds(), { wrapper });

        for (const score of [0, 3, 4, 10, 11, 16, 18, 19, 25]) {
            expect(result.current.getSeverityBand(score)).toBe(classifyRiskScore(score, configured));
        }
    });
});

describe('severity consistency — legacy adapter ratchet (roadmap 2.11)', () => {
    /**
     * Adapters that still paint severity with their own palette. Remove an entry
     * when its consumers move onto `lib/severity.ts`; never add one.
     */
    const PENDING_MIGRATION = [
        'VendorTierPill',
        'issueUi.issueSeverityClass',
        'riskScoreTheme.riskScoreClass',
        'useChartTheme.issueSeverity',
        'useStatusTheme.matrix',
    ];

    type Case = { className: string; tone: Tone } | { chartColor: string; band: SeverityBand };

    function adapterCases(): Record<string, Case[]> {
        const riskThemeVariants: riskScoreTheme.RiskScoreThemeVariant[] = [
            'badge',
            'matrix-cell',
            'card',
            'text',
            'slider',
        ];
        const cases: Record<string, Case[]> = {
            'riskScoreTheme.riskScoreClass': SEVERITY_BANDS.flatMap((band) =>
                riskThemeVariants.map((variant) => ({
                    className: riskScoreTheme.riskScoreClass(variant, band),
                    tone: SEVERITY_BAND_TONE[band],
                })),
            ),
            'issueUi.issueSeverityClass': (Object.keys(ISSUE_SEVERITY_BAND) as IssueSeverity[]).map((severity) => ({
                className: issueSeverityClass(severity),
                tone: SEVERITY_BAND_TONE[ISSUE_SEVERITY_BAND[severity]],
            })),
            CriticalityClassPill: CRITICALITY_CLASSES.map((criticality) => ({
                className: renderedClass(<CriticalityClassPill criticalityClass={criticality} />),
                tone: CRITICALITY_CLASS_TONE[criticality],
            })),
            VendorTierPill: VENDOR_TIERS.map((tier) => ({
                className: renderedClass(<VendorTierPill tier={tier} />),
                tone: VENDOR_TIER_TONE[tier],
            })),
            'useStatusTheme.matrix': [],
            'useChartTheme.issueSeverity': [],
        };
        for (const theme of THEMES) {
            themeState.theme = theme;
            const statusTheme = renderHook(() => useStatusTheme()).result.current;
            const chartTheme = renderHook(() => useChartTheme()).result.current;
            for (const band of SEVERITY_BANDS) {
                cases['useStatusTheme.matrix']?.push({
                    className: statusTheme.matrix[band],
                    tone: SEVERITY_BAND_TONE[band],
                });
                cases['useChartTheme.issueSeverity']?.push({
                    chartColor: chartTheme.issueSeverity[band],
                    band,
                });
            }
        }
        themeState.theme = 'riskhub';
        return cases;
    }

    function conforms(entry: Case): boolean {
        if ('chartColor' in entry) return entry.chartColor === severityChartColor(entry.band);
        return conformsToTone(entry.className, entry.tone);
    }

    it('lists exactly the adapters that still diverge from lib/severity', () => {
        const divergent = Object.entries(adapterCases())
            .filter(([, cases]) => cases.length === 0 || !cases.every(conforms))
            .map(([name]) => name)
            .sort();
        expect(divergent).toEqual([...PENDING_MIGRATION].sort());
    });
});
