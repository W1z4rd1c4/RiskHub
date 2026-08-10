/**
 * DORA UX — tokenized ThemedSelect three-theme visual coverage (spec §P2a).
 *
 * FR-P2a requires the tokenized <ThemedSelect> to render correctly across all
 * three RiskHub themes (riskhub / light / dark). The only pre-existing coverage
 * is a jsdom ARIA test (contrast disabled, no computed styles), so this suite
 * adds the real-browser gate — deterministic and CI-safe on every platform:
 *
 * For each theme, the select trigger's computed border, background, text and
 * focus-visible ring colors MUST equal the theme token values. The token triples
 * are read from the SSOT — frontend/src/index.css (:root / .theme-light /
 * .theme-dark) — and resolved to rgb by the browser's own colour engine (a probe
 * element) so the assertion never depends on a hand-rolled HSL→RGB conversion.
 * Axe `color-contrast` stays ENABLED and must report zero violations on the open
 * control + listbox. These computed-style + contrast assertions are the sole
 * three-theme visual gate — no pixel screenshots (machine-specific baselines rot
 * as committed binaries and break cross-platform Linux CI).
 *
 * The concrete surface is the /processes status filter — a real <ThemedSelect>
 * (triggerTestId="processes-status-filter-trigger") the risk-manager can read.
 * Themes are switched through the app's own mechanism: ThemeContext listens for
 * a `storage` event on the `riskhub-theme` key, so dispatching one drives the
 * real theme code path (root class swap) without a server write.
 */
import fs from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/auth.fixture';
import { waitForDataLoad } from './helpers/wait';

const THEMES = ['riskhub', 'light', 'dark'] as const;
type ThemeKey = (typeof THEMES)[number];

const TRIGGER_TESTID = 'processes-status-filter-trigger';
const SEARCH_TESTID = 'processes-search-input';

// Freeze transitions/animations so the computed colours read are the settled
// values (the trigger has `transition-all`, which otherwise yields
// mid-animation colours on focus).
const DISABLE_MOTION =
    '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';

// index.css is the token SSOT (P2a). Parse the first declaration block of each
// theme selector and read the ThemedSelect-relevant custom properties from it.
// The later `.theme-dark { … !important }` base/override rules carry no custom
// properties, so a first-block match cannot pick them up.
const INDEX_CSS_PATH = path.resolve(__dirname, '../../../frontend/src/index.css');

function tokenBlock(css: string, selector: string): Record<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) {
        throw new Error(`index.css: no declaration block found for "${selector}"`);
    }
    const out: Record<string, string> = {};
    for (const decl of match[1].split(';')) {
        const declMatch = decl.match(/(--[\w-]+)\s*:\s*(.+)/);
        if (declMatch) {
            out[declMatch[1].trim()] = declMatch[2].trim();
        }
    }
    return out;
}

interface ThemeTokens {
    input: string;
    foreground: string;
    ring: string;
}

const THEME_SELECTOR: Record<ThemeKey, string> = {
    riskhub: ':root',
    light: '.theme-light',
    dark: '.theme-dark',
};

const TOKENS: Record<ThemeKey, ThemeTokens> = (() => {
    const css = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
    const build = (selector: string): ThemeTokens => {
        const block = tokenBlock(css, selector);
        const require = (key: string): string => {
            const value = block[key];
            if (!value) {
                throw new Error(`index.css: "${selector}" is missing ${key}`);
            }
            return value;
        };
        return {
            input: require('--input'),
            foreground: require('--foreground'),
            ring: require('--ring'),
        };
    };
    return {
        riskhub: build(THEME_SELECTOR.riskhub),
        light: build(THEME_SELECTOR.light),
        dark: build(THEME_SELECTOR.dark),
    };
})();

async function applyTheme(page: Page, theme: ThemeKey): Promise<void> {
    await page.evaluate((value) => {
        localStorage.setItem('riskhub-theme', value);
        window.dispatchEvent(
            new StorageEvent('storage', {
                key: 'riskhub-theme',
                newValue: value,
                storageArea: localStorage,
            }),
        );
    }, theme);
    await page.waitForFunction(
        (value) => {
            const classes = document.documentElement.classList;
            if (value === 'light') return classes.contains('theme-light');
            if (value === 'dark') return classes.contains('theme-dark');
            return !classes.contains('theme-light') && !classes.contains('theme-dark');
        },
        theme,
        { timeout: 5000 },
    );
}

/** Resolve an index.css token triple to the browser's own rgb/rgba string. */
async function resolveToken(page: Page, triple: string, alpha?: number): Promise<string> {
    return page.evaluate(
        ({ value, a }) => {
            const el = document.createElement('div');
            el.style.color = a === null ? `hsl(${value})` : `hsl(${value} / ${a})`;
            document.body.appendChild(el);
            const resolved = getComputedStyle(el).color;
            el.remove();
            return resolved;
        },
        { value: triple, a: alpha ?? null },
    );
}

async function openProcessesFilter(page: Page): Promise<void> {
    await page.goto('/processes');
    await waitForDataLoad(page);
    await page.addStyleTag({ content: DISABLE_MOTION });
    await page.getByTestId(TRIGGER_TESTID).waitFor({ state: 'visible' });
}

// Deterministic per-theme gate: computed styles + focus ring + axe contrast.
for (const theme of THEMES) {
    test(`ThemedSelect ${theme} theme: computed tokens + contrast`, async ({ riskManagerPage }) => {
        const page = riskManagerPage;
        await openProcessesFilter(page);
        await applyTheme(page, theme);

        const trigger = page.getByTestId(TRIGGER_TESTID);

        // Expected colours resolved from the index.css tokens by the browser.
        const expectedBorder = await resolveToken(page, TOKENS[theme].input);
        const expectedBackground = await resolveToken(page, TOKENS[theme].input, 0.4);
        const expectedText = await resolveToken(page, TOKENS[theme].foreground);
        const expectedRing = await resolveToken(page, TOKENS[theme].ring);

        // Resting computed styles equal the theme's border-input / bg-input/40 /
        // text-foreground tokens.
        const resting = await trigger.evaluate((el) => {
            const cs = getComputedStyle(el);
            return {
                border: cs.borderTopColor,
                background: cs.backgroundColor,
                color: cs.color,
            };
        });
        expect(resting.border, `${theme} border == --input`).toBe(expectedBorder);
        expect(resting.background, `${theme} background == --input @ 0.4`).toBe(expectedBackground);
        expect(resting.color, `${theme} text == --foreground`).toBe(expectedText);

        // Focus-visible ring == --ring. Keyboard focus (Tab from the adjacent
        // search box) is what activates :focus-visible / the ring box-shadow.
        await page.getByTestId(SEARCH_TESTID).focus();
        const focusTraversalKey =
            test.info().project.name === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
        await page.keyboard.press(focusTraversalKey);
        await expect(trigger).toBeFocused();
        const focused = await trigger.evaluate((el) => ({
            focusVisible: el.matches(':focus-visible'),
            boxShadow: getComputedStyle(el).boxShadow,
        }));
        expect(focused.focusVisible, `${theme} trigger is :focus-visible`).toBe(true);
        expect(focused.boxShadow, `${theme} focus ring == --ring`).toContain(expectedRing);

        // Open the listbox and assert zero color-contrast violations on the open
        // control + listbox (axe color-contrast stays ENABLED).
        await page.keyboard.press('Enter');
        await expect(page.getByRole('listbox')).toBeVisible();
        const axe = await new AxeBuilder({ page })
            .include(`[data-testid="${TRIGGER_TESTID}"]`)
            .include('[role="listbox"]')
            .withRules(['color-contrast'])
            .analyze();
        expect(
            axe.violations,
            `${theme} color-contrast violations: ${JSON.stringify(axe.violations.map((v) => v.nodes.length))}`,
        ).toEqual([]);
    });
}
