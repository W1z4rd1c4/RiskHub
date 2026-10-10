/**
 * Runtime access to the theme's CSS custom properties (audit 2026-09-30 §4.2,
 * ADR-015 Addendum 1 §8).
 *
 * Canvas, SVG and Recharts cannot use Tailwind classes, so they read the same
 * tokens that `index.css` declares per theme through this one helper instead
 * of keeping per-theme hex tables. `useCssTokens` / `useCssThemeKey` re-read
 * whenever the root theme class changes, so charts follow a theme switch.
 */
import { useMemo, useSyncExternalStore } from 'react';

export type CssCustomProperty = `--${string}`;

/** Categorical chart series tokens (`chart.1…8` in Tailwind). */
export const CHART_TOKENS = [
    '--chart-1',
    '--chart-2',
    '--chart-3',
    '--chart-4',
    '--chart-5',
    '--chart-6',
    '--chart-7',
    '--chart-8',
] as const satisfies readonly CssCustomProperty[];
export type ChartToken = (typeof CHART_TOKENS)[number];

/** Sequential heatmap tokens (`heat.0…4` in Tailwind), lowest to highest. */
export const HEAT_TOKENS = [
    '--heat-0',
    '--heat-1',
    '--heat-2',
    '--heat-3',
    '--heat-4',
] as const satisfies readonly CssCustomProperty[];
export type HeatToken = (typeof HEAT_TOKENS)[number];

/** `H S% L%` (optionally `Hdeg`), the triplet format every colour token uses. */
const HSL_TRIPLET = /^-?\d*\.?\d+(?:deg)?\s+\d*\.?\d+%\s+\d*\.?\d+%$/;

function defaultRoot(): Element | null {
    return typeof document === 'undefined' ? null : document.documentElement;
}

/**
 * Raw, trimmed value of a CSS custom property on `element` (default: the
 * document root, where the theme class lives). Empty string when undeclared
 * or when no DOM is available.
 */
export function getCssToken(name: CssCustomProperty, element: Element | null = defaultRoot()): string {
    if (!element || typeof getComputedStyle !== 'function') return '';
    return getComputedStyle(element).getPropertyValue(name).trim();
}

function formatAlpha(alpha: number): string {
    const clamped = Math.min(1, Math.max(0, alpha));
    return ` / ${clamped}`;
}

/**
 * A colour token as a CSS colour string: `hsl(H S% L%)`, or
 * `hsl(H S% L% / alpha)` when `alpha` is given. Non-triplet values (a full
 * colour) are returned as declared. When the token cannot be read (no DOM,
 * undeclared), it degrades to an `hsl()` of a `var()` reference to `name`,
 * which still resolves in any CSS context.
 */
export function readCssColor(
    name: CssCustomProperty,
    alpha?: number,
    element: Element | null = defaultRoot(),
): string {
    const raw = getCssToken(name, element);
    const alphaPart = alpha === undefined ? '' : formatAlpha(alpha);
    if (!raw) return `hsl(var(${name})${alphaPart})`;
    if (HSL_TRIPLET.test(raw)) return `hsl(${raw}${alphaPart})`;
    return raw;
}

const THEME_ATTRIBUTES = ['class', 'data-theme'];

function subscribeToRootTheme(onChange: () => void): () => void {
    const root = defaultRoot();
    if (!root || typeof MutationObserver === 'undefined') return () => undefined;
    const observer = new MutationObserver(onChange);
    observer.observe(root, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
    return () => observer.disconnect();
}

function readRootThemeKey(): string {
    const root = defaultRoot();
    if (!root) return '';
    return `${root.className}|${root.getAttribute('data-theme') ?? ''}`;
}

/**
 * A string that changes whenever the root theme class changes. Use it as a
 * memo dependency when building a token-derived object, e.g.
 * `useMemo(() => buildChartTheme(readCssColor), [themeKey])`.
 *
 * It observes the DOM rather than `ThemeContext`, because the provider applies
 * the class in an effect: a context-driven re-read would see the old tokens.
 */
export function useCssThemeKey(): string {
    return useSyncExternalStore(subscribeToRootTheme, readRootThemeKey, () => '');
}

/**
 * Colour strings (see `readCssColor`) for `names`, re-read on theme change.
 * The result is stable between renders until the theme or the names change.
 */
export function useCssTokens<const TNames extends readonly CssCustomProperty[]>(
    names: TNames,
    alpha?: number,
): Readonly<Record<TNames[number], string>> {
    const themeKey = useCssThemeKey();
    const namesKey = names.join('|');
    return useMemo(() => {
        // `themeKey` is the re-read trigger; reading it keeps the dependency honest.
        void themeKey;
        const tokens = namesKey ? (namesKey.split('|') as CssCustomProperty[]) : [];
        return Object.fromEntries(tokens.map((name) => [name, readCssColor(name, alpha)])) as Record<
            TNames[number],
            string
        >;
    }, [namesKey, alpha, themeKey]);
}
