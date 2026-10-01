/**
 * useChartTheme - theme colours for Recharts, read from the CSS tokens.
 *
 * Recharts cannot use Tailwind classes, so every colour here is a reference to
 * a token declared per theme in `index.css` (ADR-015 Addendum 1 §8, audit
 * 2026-09-30 D1 / DS-05). There are no per-theme hex tables: the values are
 * re-read through `lib/cssTokens.ts` whenever the root theme class changes.
 *
 * - Chrome (tooltip, grid, axis, legend, cursor) uses the surface and text tokens.
 * - Categorical series use `--chart-1…8`.
 * - Severity-coded series use the D1 band tokens from `lib/severity.ts`, and
 *   status-coded series the status tones from `lib/tones.ts`, never the
 *   categorical chart tokens.
 */
import { useMemo } from 'react';

import { readCssColor, useCssThemeKey, type CssCustomProperty } from '@/lib/cssTokens';
import { SEVERITY_BANDS, severityChartToken, type SeverityBand } from '@/lib/severity';
import { TONE_CSS_VAR } from '@/lib/tones';

export interface ChartTheme {
    /** Background color for chart tooltips */
    tooltipBackground: string;
    /** Border color for chart tooltips */
    tooltipBorder: string;
    /** Primary text color in tooltips (values) */
    tooltipTextPrimary: string;
    /** Secondary text color in tooltips (labels) */
    tooltipTextSecondary: string;
    /** Legend item text (AA on every theme; series colour stays on the icon) */
    legendText: string;
    /** CartesianGrid stroke color */
    gridStroke: string;
    /** XAxis/YAxis tick text color */
    axisTickFill: string;
    /** Active dot fill color (matches background for hollow effect) */
    activeDotFill: string;
    /** Tooltip cursor line color */
    cursorStroke: string;
    /** Line/area series colors: categorical (`primary`…`neutral`) or status-coded */
    series: {
        primary: string;
        secondary: string;
        tertiary: string;
        warning: string;
        danger: string;
        success: string;
        neutral: string;
    };
    /** Threshold colors for min/max references */
    threshold: {
        min: string;
        max: string;
    };
    /** D1 severity bands (risk levels, issue severity), plus a neutral fallback */
    severity: Record<SeverityBand, string> & { fallback: string };
    /** Domain palettes used by dashboard category charts */
    breakdown: {
        status: Record<string, string>;
        form: Record<string, string>;
        frequency: Record<string, string>;
    };
}

/** A token, or a token with an alpha. */
type TokenRef = CssCustomProperty | readonly [CssCustomProperty, number];
type TokenGroup<T> = { [K in keyof T]: TokenRef };
type ChartThemeSpec = {
    [K in keyof ChartTheme]: ChartTheme[K] extends string
        ? TokenRef
        : K extends 'breakdown'
            ? { [G in keyof ChartTheme['breakdown']]: Record<string, TokenRef> }
            : TokenGroup<ChartTheme[K]>;
};

const CATEGORICAL = {
    blue: '--chart-1',
    violet: '--chart-2',
    teal: '--chart-3',
    amber: '--chart-4',
    pink: '--chart-5',
    sky: '--chart-6',
    lime: '--chart-7',
    slate: '--chart-8',
} as const satisfies Record<string, CssCustomProperty>;

/** Token behind every chart colour; the only colour source for charts. */
const CHART_THEME_TOKENS: Readonly<ChartThemeSpec> = {
    tooltipBackground: ['--popover', 0.97],
    tooltipBorder: '--border',
    tooltipTextPrimary: '--popover-foreground',
    tooltipTextSecondary: '--muted-foreground',
    legendText: '--muted-foreground',
    gridStroke: ['--tint', 0.08],
    axisTickFill: '--muted-foreground',
    activeDotFill: '--background',
    cursorStroke: ['--muted-foreground', 0.4],
    series: {
        primary: CATEGORICAL.blue,
        secondary: CATEGORICAL.violet,
        tertiary: CATEGORICAL.teal,
        warning: TONE_CSS_VAR.warning,
        danger: TONE_CSS_VAR.danger,
        success: TONE_CSS_VAR.success,
        neutral: CATEGORICAL.slate,
    },
    threshold: {
        min: TONE_CSS_VAR.warning,
        max: TONE_CSS_VAR.danger,
    },
    severity: {
        ...(Object.fromEntries(SEVERITY_BANDS.map((band) => [band, severityChartToken(band)])) as Record<
            SeverityBand,
            CssCustomProperty
        >),
        fallback: CATEGORICAL.slate,
    },
    breakdown: {
        status: {
            active: TONE_CSS_VAR.success,
            inactive: CATEGORICAL.slate,
            pending: TONE_CSS_VAR.warning,
            deprecated: TONE_CSS_VAR.danger,
        },
        form: {
            preventive: CATEGORICAL.blue,
            detective: CATEGORICAL.violet,
            corrective: CATEGORICAL.amber,
        },
        frequency: {
            daily: CATEGORICAL.teal,
            weekly: CATEGORICAL.sky,
            monthly: CATEGORICAL.blue,
            quarterly: CATEGORICAL.violet,
            'semi-annually': CATEGORICAL.pink,
            annually: CATEGORICAL.lime,
            ad_hoc: CATEGORICAL.slate,
            continuous: CATEGORICAL.amber,
        },
    },
};

function readToken(ref: TokenRef): string {
    return typeof ref === 'string' ? readCssColor(ref) : readCssColor(ref[0], ref[1]);
}

function readGroup<T extends Record<string, TokenRef>>(group: T): { [K in keyof T]: string } {
    return Object.fromEntries(
        Object.entries(group).map(([key, ref]) => [key, readToken(ref as TokenRef)]),
    ) as { [K in keyof T]: string };
}

/** Resolve every chart colour against the current theme's tokens. */
function buildChartTheme(spec: Readonly<ChartThemeSpec> = CHART_THEME_TOKENS): ChartTheme {
    return {
        tooltipBackground: readToken(spec.tooltipBackground),
        tooltipBorder: readToken(spec.tooltipBorder),
        tooltipTextPrimary: readToken(spec.tooltipTextPrimary),
        tooltipTextSecondary: readToken(spec.tooltipTextSecondary),
        legendText: readToken(spec.legendText),
        gridStroke: readToken(spec.gridStroke),
        axisTickFill: readToken(spec.axisTickFill),
        activeDotFill: readToken(spec.activeDotFill),
        cursorStroke: readToken(spec.cursorStroke),
        series: readGroup(spec.series),
        threshold: readGroup(spec.threshold),
        severity: readGroup(spec.severity),
        breakdown: {
            status: readGroup(spec.breakdown.status),
            form: readGroup(spec.breakdown.form),
            frequency: readGroup(spec.breakdown.frequency),
        },
    };
}

/**
 * Theme colours for Recharts components, re-read on theme change.
 *
 * @example
 * ```tsx
 * const chartTheme = useChartTheme();
 * <Tooltip {...getChartTooltipProps(chartTheme)} />
 * ```
 */
export function useChartTheme(): ChartTheme {
    const themeKey = useCssThemeKey();
    return useMemo(() => {
        // `themeKey` is the re-read trigger; reading it keeps the dependency honest.
        void themeKey;
        return buildChartTheme();
    }, [themeKey]);
}
