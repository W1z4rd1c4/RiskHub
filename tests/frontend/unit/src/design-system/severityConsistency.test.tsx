import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import * as criticalityPillModule from '@/components/ict-register/CriticalityClassPill';
import { CriticalityClassPill, VendorTierPill } from '@/components/ict-register/CriticalityClassPill';
import * as issueBadgesModule from '@/components/issues/IssueBadges';
import { IssueSeverityBadge } from '@/components/issues/IssueBadges';
import { SeverityBadge } from '@/components/ui/badge';
import * as useChartThemeModule from '@/hooks/useChartTheme';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import * as monitoringStatusModule from '@/lib/monitoringStatus';
import { riskHubKeys } from '@/lib/queryKeys';
import * as severityModule from '@/lib/severity';
import {
    classifyRiskScore,
    CRITICALITY_CLASS_BAND,
    CRITICALITY_CLASS_TONE,
    CRITICALITY_CLASSES,
    criticalityClass,
    ISSUE_SEVERITY_BAND,
    ordinalSeverityBand,
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
import { getControlRiskLevelColor } from '@/pages/controls/controlsPagePresentation';
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
 * 3. Single source: every adapter (issue pills, DORA criticality and vendor
 *    tier pills, chart series) resolves each band to the same token family as
 *    `lib/severity.ts`, and the legacy palettes (`useStatusTheme`,
 *    `riskScoreTheme`, the `useChartTheme` hex tables) are gone for good.
 */

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
     * An adapter module may re-export a name from lib/severity.ts or
     * lib/tones.ts only as the identical binding, so an auto-import can never
     * pick a same-named helper with a different palette.
     */
    const canonical: Record<string, unknown> = { ...tonesModule, ...severityModule };
    const adapterModules: Record<string, Record<string, unknown>> = {
        'lib/monitoringStatus': monitoringStatusModule,
        'components/issues/IssueBadges': issueBadgesModule,
        'components/ict-register/CriticalityClassPill': criticalityPillModule,
        'hooks/useChartTheme': useChartThemeModule,
    };

    it.each(Object.entries(adapterModules))('%s shares no export name with a different value', (_name, adapter) => {
        for (const exportName of Object.keys(adapter).filter((key) => key in canonical)) {
            expect(adapter[exportName], exportName).toBe(canonical[exportName]);
        }
    });
});

describe('severity consistency — thresholds come from configuration (ADR-008)', () => {
    const configured = { critical: 19, high: 11, medium: 4 };

    it('classifies scores without any literal cut-off', () => {
        expect(classifyRiskScore.toString()).not.toMatch(/\d/);
        const severitySource = readSource('frontend/src/lib/severity.ts');
        expect(severitySource).not.toMatch(/\b(?:score|net_score|gross_score|risk_score)\s*[<>]=?\s*\d/);
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

describe('severity consistency — every adapter uses the single source (roadmap 2.11)', () => {
    const ORDINAL_RATINGS = [1, 2, 3, 4, 5] as const;

    it('maps 1-5 ordinal ratings onto the D1 bands (5 critical, 4 high, 3 medium, 1-2 low)', () => {
        expect(ORDINAL_RATINGS.map(ordinalSeverityBand)).toEqual(['low', 'low', 'medium', 'high', 'critical']);
    });

    type Case = { className: string; tone: Tone } | { chartColor: string; band: SeverityBand };

    function adapterCases(): Record<string, Case[]> {
        const chartTheme = renderHook(() => useChartTheme()).result.current;
        return {
            IssueSeverityBadge: (Object.keys(ISSUE_SEVERITY_BAND) as IssueSeverity[]).map((severity) => ({
                className: renderedClass(<IssueSeverityBadge severity={severity} />),
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
            'controlsPagePresentation.getControlRiskLevelColor': ORDINAL_RATINGS.map((level) => ({
                className: getControlRiskLevelColor(level),
                tone: SEVERITY_BAND_TONE[ordinalSeverityBand(level)],
            })),
            // D13: the vendor form, register and header render the 1-5 vendor
            // risk score as a `SeverityBadge` on its ordinal band.
            'vendor risk score SeverityBadge': ORDINAL_RATINGS.map((score) => ({
                className: renderedClass(<SeverityBadge band={ordinalSeverityBand(score)} label={`${score} / 5`} />),
                tone: SEVERITY_BAND_TONE[ordinalSeverityBand(score)],
            })),
            'useChartTheme.severity': SEVERITY_BANDS.map((band) => ({
                chartColor: chartTheme.severity[band],
                band,
            })),
        };
    }

    function conforms(entry: Case): boolean {
        if ('chartColor' in entry) return entry.chartColor === severityChartColor(entry.band);
        return conformsToTone(entry.className, entry.tone);
    }

    it.each(Object.entries(adapterCases()))('%s maps every band onto its D1 token family', (_name, cases) => {
        expect(cases.length).toBeGreaterThan(0);
        for (const entry of cases) {
            expect(conforms(entry), JSON.stringify(entry)).toBe(true);
        }
    });

    it('reads the chart severity series from the band tokens, not hex tables', () => {
        const chartSource = readSource('frontend/src/hooks/useChartTheme.ts');
        expect(chartSource).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(chartSource).not.toMatch(/\brgba?\(/);
        expect(chartSource).toContain('severityChartToken');
    });

    it('has no legacy severity palette module left, and nothing imports one', () => {
        const legacyModules = ['frontend/src/hooks/useStatusTheme.ts', 'frontend/src/lib/riskScoreTheme.ts'];
        for (const legacy of legacyModules) {
            expect(existsSync(resolve(repoRoot, legacy)), legacy).toBe(false);
        }

        const srcRoot = resolve(repoRoot, 'frontend/src');
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const path = join(dir, entry);
                if (statSync(path).isDirectory()) {
                    walk(path);
                } else if (/\.(?:ts|tsx)$/.test(entry)) {
                    const source = readFileSync(path, 'utf8');
                    if (/useStatusTheme|riskScoreTheme|legacyRiskScoreVariantClass/.test(source)) {
                        offenders.push(relative(srcRoot, path));
                    }
                }
            }
        };
        walk(srcRoot);
        expect(offenders).toEqual([]);
    });
});
