import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { BrandWordmark } from '@/components/layout/BrandWordmark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Card } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { usePageTitle } from '@/hooks/usePageTitle';
import { normalizeSupportedLanguage, type SupportedLanguage } from '@/i18n';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { useSessionSnapshot } from '@/services/session';
import { selectLocalLanguage, THEME_KEY } from '@/utils/userSettingsStorage';

type ColorScheme = 'light' | 'dark';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/**
 * D14 theme policy for pre-auth pages: without an explicit app theme, follow the OS
 * colour scheme, dark → the RiskHub theme, light → the Light theme. The theme class
 * scopes the existing tokens to this subtree (index.css defines every theme on a class),
 * so the theme on `<html>` is left alone. `color-scheme` keeps native controls and
 * scrollbars in step.
 */
const SCHEME_CLASS: Readonly<Record<ColorScheme, string>> = {
    dark: 'theme-riskhub [color-scheme:dark]',
    light: 'theme-light [color-scheme:light]',
};

/** The values `ThemeProvider` stores under `THEME_KEY` (`riskhub-theme`). */
const APP_THEMES: ReadonlySet<string> = new Set(['light', 'dark', 'riskhub']);

function matchDarkScheme(): MediaQueryList | null {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(DARK_SCHEME_QUERY)
        : null;
}

function usePreferredColorScheme(): ColorScheme {
    const [scheme, setScheme] = useState<ColorScheme>(() => (matchDarkScheme()?.matches === false ? 'light' : 'dark'));
    useEffect(() => {
        const query = matchDarkScheme();
        if (!query) return undefined;
        const update = () => setScheme(query.matches ? 'dark' : 'light');
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return scheme;
}

function hasStoredAppTheme(): boolean {
    try {
        const stored = window.localStorage.getItem(THEME_KEY);
        return stored !== null && APP_THEMES.has(stored);
    } catch {
        return false;
    }
}

/** `ThemeProvider` and preference hydration announce theme writes with (synthetic) `storage` events. */
function subscribeStoredAppTheme(onChange: () => void): () => void {
    const listener = (event: Event) => {
        const { key } = event as StorageEvent;
        if (key === null || key === undefined || key === THEME_KEY) onChange();
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
}

/**
 * Whether the user has an explicit app theme, which then wins over the OS scheme: a
 * signed-in session (e.g. `/auth/local/security`; its server preference drives `<html>`
 * through `ThemeProvider`) or a theme stored under `riskhub-theme`. Logout clears both.
 */
function useHasExplicitAppTheme(): boolean {
    const session = useSessionSnapshot();
    const stored = useSyncExternalStore(subscribeStoredAppTheme, hasStoredAppTheme, () => false);
    return session.token !== null || stored;
}

/** Local (pre-auth) language choice: activates the locale, then persists it. */
function useLocalLanguageChoice() {
    const { i18n } = useTranslation('auth');
    const flight = useRef<AbortController | null>(null);
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => () => flight.current?.abort(), []);
    const choose = (language: SupportedLanguage) => {
        flight.current?.abort();
        const controller = new AbortController();
        flight.current = controller;
        setPending(true);
        setFailed(false);
        void selectLocalLanguage(i18n, language, controller.signal)
            .catch(() => { if (!controller.signal.aborted) setFailed(true); })
            .finally(() => { if (!controller.signal.aborted) setPending(false); });
    };
    return { language: normalizeSupportedLanguage(i18n.language), choose, pending, failed };
}

/**
 * A caller-owned language switch. The production SSO login and its standalone preview keep
 * their own language state (fixed-language copy, their own load-failure message), so they
 * drive the frame's `LanguageSwitch` instead of the frame's local language choice.
 */
export interface AuthFrameLanguageControl {
    value: SupportedLanguage;
    onChange: (language: SupportedLanguage) => void;
    /** Translated group name; defaults to `auth:public_frame.language`. */
    label?: string;
    disabled?: boolean;
}

const CARD_WIDTH = {
    /** Sign-in, status and error cards. */
    default: 'max-w-md',
    /** Content that needs columns (the demo persona grid). */
    wide: 'max-w-6xl',
} as const;

export interface AuthFrameProps {
    /** The page `h1`; focused whenever it changes and mirrored into `document.title`. */
    title: string;
    children: ReactNode;
    /** `document.title` page name when it differs from the `h1` (defaults to `title`). */
    documentTitle?: string;
    /** Uppercase eyebrow above the `h1` (`.text-eyebrow`). */
    eyebrow?: ReactNode;
    /** Lead text under the `h1`. */
    subtitle?: ReactNode;
    /** Quiet note under the card (environment or legal note). */
    footer?: ReactNode;
    /** Card width: `default` (`max-w-md`) or `wide` for column layouts. */
    size?: keyof typeof CARD_WIDTH;
    /** Caller-owned language switch; without it the frame activates and persists the local choice itself. */
    language?: AuthFrameLanguageControl;
    /** Blocking error text, announced (`role="alert"`) and focused whenever it changes. */
    error?: string | null;
    /** Marks the page content (`children`) `aria-busy`; the status line stays outside it so it is announced. */
    busy?: boolean;
    /** Polite status text (e.g. "Please wait…"); the live region is always mounted. */
    status?: ReactNode;
}

/**
 * Frame for public and pre-auth pages (audit 2026-09-30 §4.20, DS-24, AX-15, RS-02):
 * a `<main>` landmark that grows and scrolls with its content (never clips on short
 * viewports), a header with the `BrandWordmark` and the `LanguageSwitch`, and one card
 * holding the page `h1` (optional eyebrow and subtitle) and the page content, with an
 * optional quiet footer under it. Used by the login (SSO, demo, native, loading and
 * error states), the SSO callback, the landing page and the production-login preview.
 * Without an explicit app theme (public, signed-out context) the frame follows the OS
 * colour scheme (D14); a signed-in user or a stored theme keeps the app theme that
 * `ThemeProvider` puts on `<html>` (`data-theme-source` says which).
 */
export function AuthFrame({
    title,
    children,
    documentTitle,
    eyebrow,
    subtitle,
    footer,
    size = 'default',
    language: languageControl,
    error,
    busy,
    status,
}: AuthFrameProps) {
    const { t } = useTranslation('auth');
    const scheme = usePreferredColorScheme();
    const followsSystemScheme = !useHasExplicitAppTheme();
    const localLanguage = useLocalLanguageChoice();
    const heading = useRef<HTMLHeadingElement>(null);
    const alert = useRef<HTMLDivElement>(null);

    usePageTitle(documentTitle ?? title);
    useEffect(() => { heading.current?.focus(); }, [title]);
    useEffect(() => { if (error) alert.current?.focus(); }, [error]);

    return (
        <main
            data-theme-source={followsSystemScheme ? 'system' : 'app'}
            className={cn(
                followsSystemScheme && SCHEME_CLASS[scheme],
                'flex min-h-screen flex-col overflow-y-auto bg-background text-foreground',
            )}
        >
            <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
                <BrandWordmark className="font-heading text-lg font-bold tracking-tight" />
                <LanguageSwitch
                    label={languageControl?.label ?? t('public_frame.language')}
                    showLabel
                    value={languageControl?.value ?? localLanguage.language}
                    onChange={languageControl?.onChange ?? localLanguage.choose}
                    disabled={languageControl ? languageControl.disabled : localLanguage.pending}
                />
            </header>
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 p-6">
                <Card as="section" className={cn('w-full space-y-5 shadow-popover', CARD_WIDTH[size])}>
                    <div className="space-y-2">
                        {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
                        <h1 ref={heading} tabIndex={-1} className="font-heading text-2xl font-bold tracking-tight text-foreground focus:outline-none">
                            {title}
                        </h1>
                        {subtitle ? <div className="space-y-2 text-sm text-muted-foreground">{subtitle}</div> : null}
                    </div>
                    {!languageControl && localLanguage.failed
                        ? <InlineMessage tone="danger">{t('public_frame.language_error')}</InlineMessage>
                        : null}
                    {error ? <InlineMessage ref={alert} tabIndex={-1} tone="danger">{error}</InlineMessage> : null}
                    <p role="status" className="text-sm text-muted-foreground empty:sr-only">{status}</p>
                    <div className="space-y-5" aria-busy={busy || undefined}>{children}</div>
                </Card>
                {footer ? (
                    <p className={cn('w-full text-center text-xs text-muted-foreground', CARD_WIDTH[size])}>{footer}</p>
                ) : null}
            </div>
        </main>
    );
}
