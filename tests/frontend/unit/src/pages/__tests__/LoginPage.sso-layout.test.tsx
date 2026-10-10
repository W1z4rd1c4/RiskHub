import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resources as czechResources } from '@/i18n/locales/cs';
import { resources as englishResources } from '@/i18n/locales/en';
import ProdLoginPreviewPage from '@/pages/ProdLoginPreviewPage';
import { SsoOnlyView } from '@/pages/login/SsoOnlyView';
import { getProdAuthCopy } from '@/pages/login/prodAuthCopy';

type ProdCopyKey = keyof typeof englishResources.auth.login_sso_prod;

function translatorFor(language: 'en' | 'cs') {
    const copy = (language === 'en' ? englishResources : czechResources).auth.login_sso_prod;
    return (key: string) => copy[key.replace('login_sso_prod.', '') as ProdCopyKey] ?? key;
}

function renderProductionSso(language: 'en' | 'cs') {
    return render(
        <SsoOnlyView
            showBootstrapUnavailableBanner={false}
            ssoLogoutRecoveryMessage={null}
            prodCopy={getProdAuthCopy(translatorFor(language))}
            prodErrorMessage=""
            prodLanguage={language}
            isSsoLoading={false}
            isSsoLogoutRecoveryPending={false}
            ssoEnabled
            onChangeLanguage={vi.fn()}
            onRetrySsoLogout={vi.fn()}
            onSsoLogin={vi.fn()}
            translate={(key) => key}
        />,
    );
}

describe('production SSO login (GAP-B-01, RS-02)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.documentElement.lang = 'en';
    });

    it.each(['en', 'cs'] as const)('never renders preview-only copy in %s', (language) => {
        renderProductionSso(language);
        const copy = (language === 'en' ? englishResources : czechResources).auth.login_sso_prod;

        expect(screen.getByRole('button', { name: copy.button_label })).toBeInTheDocument();
        expect(screen.queryByText(copy.button_hint)).not.toBeInTheDocument();
        expect(screen.queryByText(copy.preview_note)).not.toBeInTheDocument();
    });

    it('lets the frame grow and scroll instead of clipping short viewports', () => {
        const { container } = renderProductionSso('en');
        const frame = container.firstElementChild as HTMLElement;

        // AX-15: the shared AuthFrame is the page's main landmark and grows with its content (RS-02).
        expect(screen.getByRole('main')).toBe(frame);
        expect(frame).toHaveClass('min-h-screen', 'overflow-y-auto');
        expect(frame).not.toHaveClass('h-screen', 'overflow-hidden');
        expect(container.querySelector('.h-screen, .min-h-0, .overflow-hidden')).toBeNull();
        // The language switch sits in the frame header, in normal flow above the card, so nothing overlays it.
        const header = frame.querySelector('header') as HTMLElement;
        expect(header.nextElementSibling).toContainElement(screen.getByRole('heading', { level: 1 }));
        expect(within(header).getByRole('group', { name: 'Language' })).toBeInTheDocument();
        expect(within(header).getByRole('button', { name: 'CS' })).toBeEnabled();
        expect(within(header).getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    });

    it.each([
        [false, 'theme-light'],
        [true, 'theme-riskhub'],
    ] as const)('follows the OS colour scheme on tokens only (dark=%s → %s, D14)', (dark, themeClass) => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: dark,
            media: '(prefers-color-scheme: dark)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        const { container } = renderProductionSso('cs');
        const frame = screen.getByRole('main');

        expect(frame).toHaveAttribute('data-theme-source', 'system');
        expect(frame).toHaveClass(themeClass, 'bg-background', 'text-foreground');
        // No bespoke palette: no raw colour, white-alpha or arbitrary colour classes anywhere in the view.
        const classes = Array.from(container.querySelectorAll('[class]'))
            .flatMap((element) => (element.getAttribute('class') ?? '').split(/\s+/));
        expect(classes.filter((name) => (
            /^(?:[a-z-]+:)*(?:bg|text|border|from|via|to)-(?:slate|sky|rose|amber|white|black)(?:-|\/|$)/.test(name)
            || /-\[(?:#|rgba?\()/.test(name)
        ))).toEqual([]);
        expect(screen.getByRole('heading', { level: 1, name: czechResources.auth.login_sso_prod.title })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: czechResources.auth.login_sso_prod.button_label })).toHaveClass('bg-accent');
    });

    it('announces the sign-in error and keeps the Microsoft action available', () => {
        render(
            <SsoOnlyView
                showBootstrapUnavailableBanner
                ssoLogoutRecoveryMessage="Microsoft sign-out did not complete."
                prodCopy={getProdAuthCopy(translatorFor('en'))}
                prodErrorMessage="Single sign-on failed. Please try again."
                prodLanguage="en"
                isSsoLoading={false}
                isSsoLogoutRecoveryPending={false}
                ssoEnabled
                onChangeLanguage={vi.fn()}
                onRetrySsoLogout={vi.fn()}
                onSsoLogin={vi.fn()}
                translate={(key) => key}
            />,
        );

        const alerts = screen.getAllByRole('alert');
        expect(alerts.some((alert) => alert.textContent?.includes('Single sign-on failed. Please try again.'))).toBe(true);
        expect(alerts.some((alert) => alert.textContent?.includes('login.unavailable_bootstrap_error'))).toBe(true);
        expect(screen.getByRole('button', { name: 'logout.complete_microsoft_sign_out' })).toBeEnabled();
        expect(screen.getByRole('button', { name: englishResources.auth.login_sso_prod.button_label })).toBeEnabled();
    });
});

describe('ProdLoginPreviewPage', () => {
    afterEach(() => {
        document.documentElement.lang = 'en';
    });

    it('keeps the preview-only notice on the preview route', () => {
        render(<ProdLoginPreviewPage />);
        const copy = czechResources.auth.login_sso_prod;

        expect(screen.getByText(copy.button_hint)).toBeInTheDocument();
        expect(screen.getByText(copy.preview_note)).toBeInTheDocument();
        expect(screen.getByRole('main')).toHaveClass('min-h-screen', 'overflow-y-auto');
        expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    });

    it('renders the same SSO view as production and switches its copy locally', async () => {
        render(<ProdLoginPreviewPage />);

        await userEvent.setup().click(screen.getByRole('button', { name: 'EN' }));

        const copy = englishResources.auth.login_sso_prod;
        expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
        expect(document.documentElement.lang).toBe('en');
        expect(document.title).toBe(copy.html_title);
        expect(localStorage.getItem('riskhub-language')).not.toBe('en');
    });
});
