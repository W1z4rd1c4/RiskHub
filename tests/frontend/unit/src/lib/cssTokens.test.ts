import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    CHART_TOKENS,
    getCssToken,
    HEAT_TOKENS,
    readCssColor,
    useCssThemeKey,
    useCssTokens,
} from '@/lib/cssTokens';

const THEME_CLASSES = ['theme-riskhub', 'theme-dark', 'theme-light'];

let styleElement: HTMLStyleElement;

beforeEach(() => {
    styleElement = document.createElement('style');
    styleElement.textContent = `
        .theme-riskhub { --chart-1: 210 100% 60%; --chart-2: 262 83% 66%; }
        .theme-light { --chart-1: 210 100% 45%; --chart-2: 262 83% 51%; }
    `;
    document.head.appendChild(styleElement);
    document.documentElement.classList.add('theme-riskhub');
});

afterEach(() => {
    styleElement.remove();
    document.documentElement.classList.remove(...THEME_CLASSES);
    document.documentElement.removeAttribute('style');
});

describe('lib/cssTokens', () => {
    it('lists the chart and heat token families', () => {
        expect(CHART_TOKENS).toEqual([
            '--chart-1',
            '--chart-2',
            '--chart-3',
            '--chart-4',
            '--chart-5',
            '--chart-6',
            '--chart-7',
            '--chart-8',
        ]);
        expect(HEAT_TOKENS).toEqual(['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4']);
    });

    it('reads a custom property from the theme root, trimmed', () => {
        expect(getCssToken('--chart-1')).toBe('210 100% 60%');
        document.documentElement.classList.replace('theme-riskhub', 'theme-light');
        expect(getCssToken('--chart-1')).toBe('210 100% 45%');
    });

    it('returns an empty string for undeclared tokens or without an element', () => {
        expect(getCssToken('--not-declared')).toBe('');
        expect(getCssToken('--chart-1', null)).toBe('');
    });

    it('formats HSL triplets as colours, with an optional clamped alpha', () => {
        expect(readCssColor('--chart-1')).toBe('hsl(210 100% 60%)');
        expect(readCssColor('--chart-1', 0.25)).toBe('hsl(210 100% 60% / 0.25)');
        expect(readCssColor('--chart-1', 4)).toBe('hsl(210 100% 60% / 1)');
        expect(readCssColor('--chart-1', -1)).toBe('hsl(210 100% 60% / 0)');
    });

    it('passes full colour values through unchanged', () => {
        document.documentElement.style.setProperty('--custom-colour', ' rgb(1, 2, 3) ');
        expect(readCssColor('--custom-colour')).toBe('rgb(1, 2, 3)');
    });

    it('degrades to a var() reference when the token cannot be read', () => {
        expect(readCssColor('--not-declared')).toBe('hsl(var(--not-declared))');
        expect(readCssColor('--not-declared', 0.5)).toBe('hsl(var(--not-declared) / 0.5)');
    });

    it('re-reads tokens when the root theme class changes', async () => {
        const { result } = renderHook(() => useCssTokens(['--chart-1', '--chart-2']));
        expect(result.current).toEqual({
            '--chart-1': 'hsl(210 100% 60%)',
            '--chart-2': 'hsl(262 83% 66%)',
        });

        act(() => {
            document.documentElement.classList.replace('theme-riskhub', 'theme-light');
        });

        await waitFor(() => {
            expect(result.current['--chart-1']).toBe('hsl(210 100% 45%)');
        });
        expect(result.current['--chart-2']).toBe('hsl(262 83% 51%)');
    });

    it('keeps the token map stable across renders while the theme is unchanged', () => {
        const { result, rerender } = renderHook(() => useCssTokens(['--chart-1'], 0.5));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
        expect(first['--chart-1']).toBe('hsl(210 100% 60% / 0.5)');
    });

    it('subscribes once per consumer and disconnects its observer on unmount', () => {
        const Original = globalThis.MutationObserver;
        const live = new Set<MutationObserver>();
        let observeCalls = 0;
        class TrackingObserver extends Original {
            override observe(target: Node, options?: MutationObserverInit) {
                observeCalls += 1;
                live.add(this);
                super.observe(target, options);
            }
            override disconnect() {
                live.delete(this);
                super.disconnect();
            }
        }
        globalThis.MutationObserver = TrackingObserver;
        try {
            const themeKey = renderHook(() => useCssThemeKey());
            const tokens = renderHook(() => useCssTokens(['--chart-1']));
            expect(live.size).toBe(2);

            themeKey.rerender();
            tokens.rerender();
            expect(observeCalls).toBe(2);

            themeKey.unmount();
            tokens.unmount();
            expect(live.size).toBe(0);
        } finally {
            globalThis.MutationObserver = Original;
        }
    });

    it('exposes a theme key that changes with the root theme class', async () => {
        const { result } = renderHook(() => useCssThemeKey());
        const initial = result.current;
        expect(initial).toContain('theme-riskhub');

        act(() => {
            document.documentElement.classList.replace('theme-riskhub', 'theme-dark');
        });

        await waitFor(() => {
            expect(result.current).not.toBe(initial);
        });
        expect(result.current).toContain('theme-dark');
    });
});
