import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthFrame } from '@/components/layout/AuthFrame';
import { BrandWordmark } from '@/components/layout/BrandWordmark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import i18n from '@/i18n';
import { useTranslation } from '@/i18n/hooks';
import { setSessionSnapshot } from '@/services/session';
import type { AuthUser } from '@/services/authApi';

/** Controllable `prefers-color-scheme: dark` media query. */
function stubColorScheme(dark: boolean) {
    const listeners = new Set<() => void>();
    const query = {
        matches: dark,
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => query));
    return {
        set(next: boolean) {
            query.matches = next;
            listeners.forEach((listener) => listener());
        },
    };
}

afterEach(async () => {
    vi.unstubAllGlobals();
    await i18n.changeLanguage('en');
    document.title = '';
});

describe('BrandWordmark (NAV-07)', () => {
    it('renders one accessible "RiskHub" name with the accent half styled by token', () => {
        render(<BrandWordmark data-testid="wordmark" className="text-xl" />);
        const wordmark = screen.getByTestId('wordmark');
        expect(wordmark).toHaveTextContent(/^RiskHub$/);
        expect(wordmark).toHaveClass('text-xl');
        expect(within(wordmark).getByText('Hub')).toHaveClass('text-accent-text');
    });
});

describe('LanguageSwitch (GAP-C-22)', () => {
    it('is a named group of aria-pressed buttons that reports every choice', async () => {
        const onChange = vi.fn();
        render(<LanguageSwitch label="Language" value="en" onChange={onChange} />);
        const group = screen.getByRole('group', { name: 'Language' });
        const czech = within(group).getByRole('button', { name: 'CS' });
        const english = within(group).getByRole('button', { name: 'EN' });
        expect(english).toHaveAttribute('aria-pressed', 'true');
        expect(czech).toHaveAttribute('aria-pressed', 'false');

        await userEvent.setup().click(czech);
        expect(onChange).toHaveBeenCalledWith('cs');
    });

    it('names the group by its visible label and can be disabled', () => {
        render(<LanguageSwitch label="Jazyk" showLabel value="cs" onChange={vi.fn()} disabled />);
        const group = screen.getByRole('group', { name: 'Jazyk' });
        expect(group).not.toHaveAttribute('aria-label');
        for (const button of within(group).getAllByRole('button')) expect(button).toBeDisabled();
    });
});

describe('AuthFrame (DS-24, AX-15, RS-02, D14)', () => {
    it('renders a scrolling main landmark with the brand, language switch and a focused h1', async () => {
        stubColorScheme(true);
        const { container } = render(<AuthFrame title="Sign in to RiskHub"><p>Form</p></AuthFrame>);
        const main = screen.getByRole('main');
        expect(main).toHaveClass('min-h-screen', 'overflow-y-auto', 'bg-background', 'text-foreground');
        expect(main).not.toHaveClass('h-screen', 'overflow-hidden');
        const heading = screen.getByRole('heading', { level: 1, name: 'Sign in to RiskHub' });
        expect(heading).toHaveFocus();
        expect(document.title).toBe('Sign in to RiskHub · RiskHub');
        expect(within(main).getByText('Hub')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
        // jsdom has no layout, so contrast is measured by G-RENDER instead.
        const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('follows the OS colour scheme without an explicit app theme: dark → RiskHub theme, light → Light theme', () => {
        const scheme = stubColorScheme(false);
        render(<AuthFrame title="Sign in"><p>Form</p></AuthFrame>);
        const main = screen.getByRole('main');
        expect(main).toHaveAttribute('data-theme-source', 'system');
        expect(main).toHaveClass('theme-light');
        expect(main).not.toHaveClass('theme-riskhub');

        act(() => scheme.set(true));
        expect(main).toHaveClass('theme-riskhub');
        expect(main).not.toHaveClass('theme-light');
        // The theme on <html> is not touched.
        expect(document.documentElement).not.toHaveClass('theme-light');
    });

    it('keeps a stored app theme instead of the OS scheme, also once hydration stores it', () => {
        const scheme = stubColorScheme(false);
        render(<AuthFrame title="Sign in"><p>Form</p></AuthFrame>);
        const main = screen.getByRole('main');
        expect(main).toHaveClass('theme-light');

        // Preference hydration stores the theme and announces it with a storage event.
        act(() => {
            localStorage.setItem('riskhub-theme', 'dark');
            window.dispatchEvent(new StorageEvent('storage', { key: 'riskhub-theme', newValue: 'dark' }));
        });
        expect(main).toHaveAttribute('data-theme-source', 'app');
        expect(main.className).not.toMatch(/(?:^|\s)theme-/);

        act(() => scheme.set(true));
        expect(main.className).not.toMatch(/(?:^|\s)theme-/);
    });

    it('ignores an unknown stored theme value', () => {
        stubColorScheme(false);
        localStorage.setItem('riskhub-theme', 'sepia');
        render(<AuthFrame title="Sign in"><p>Form</p></AuthFrame>);
        expect(screen.getByRole('main')).toHaveAttribute('data-theme-source', 'system');
        expect(screen.getByRole('main')).toHaveClass('theme-light');
    });

    it('respects the signed-in user\'s app theme on authenticated routes (/auth/local/security)', () => {
        stubColorScheme(false);
        act(() => {
            setSessionSnapshot((previous) => ({
                ...previous,
                token: 'session-token',
                user: { id: 7, email: 'alice@example.test' } as AuthUser,
                bootstrapStatus: 'authenticated',
            }));
        });
        render(<AuthFrame title="Account security"><p>Form</p></AuthFrame>);
        const main = screen.getByRole('main');
        expect(main).toHaveAttribute('data-theme-source', 'app');
        expect(main).not.toHaveClass('theme-light');
        expect(main).not.toHaveClass('theme-riskhub');

        // Signing out (no stored theme left) hands the frame back to the OS scheme.
        act(() => {
            setSessionSnapshot((previous) => ({ ...previous, token: null, user: null }));
        });
        expect(main).toHaveAttribute('data-theme-source', 'system');
        expect(main).toHaveClass('theme-light');
    });

    it('announces and focuses errors, and marks the page content busy while the status stays announced', () => {
        stubColorScheme(true);
        const { rerender } = render(<AuthFrame title="Sign in" busy status="Please wait…"><p>Form</p></AuthFrame>);
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Please wait…');
        // A busy live region (or one inside a busy element) is not announced.
        expect(status.closest('[aria-busy="true"]')).toBeNull();
        expect(screen.getByText('Form').parentElement).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('heading', { level: 1 }).closest('[aria-busy="true"]')).toBeNull();

        rerender(<AuthFrame title="Sign in" error="The code is not valid."><p>Form</p></AuthFrame>);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('The code is not valid.');
        expect(alert).toHaveFocus();
    });

    it('switches the local language and moves focus to the retitled h1', async () => {
        stubColorScheme(true);
        function Localised() {
            const { t } = useTranslation('auth');
            return <AuthFrame title={t('native.login_title')}><p>Form</p></AuthFrame>;
        }
        render(<Localised />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'CS' }));
        // `selectLocalLanguage` persists the choice only after the language has activated.
        await vi.waitFor(() => {
            expect(i18n.language).toBe('cs');
            expect(localStorage.getItem('riskhub-language')).toBe('cs');
        });
        const heading = await screen.findByRole('heading', { level: 1, name: 'Přihlášení do RiskHub' });
        // Focus moves in a passive effect after the retitled h1 commits.
        await waitFor(() => expect(heading).toHaveFocus());
        expect(screen.getByRole('group', { name: 'Jazyk' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CS' })).toHaveAttribute('aria-pressed', 'true');
    });
});
