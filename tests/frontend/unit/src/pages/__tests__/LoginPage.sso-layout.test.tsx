import { render, screen } from '@testing-library/react';
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
        const column = frame.querySelector('header')?.parentElement as HTMLElement;

        expect(frame).toHaveClass('min-h-screen', 'overflow-y-auto');
        expect(frame).not.toHaveClass('h-screen', 'overflow-hidden');
        expect(column).toHaveClass('min-h-screen');
        expect(column).not.toHaveClass('h-screen');
        expect(container.querySelector('.min-h-0')).toBeNull();
        // The language switch stays stacked above the content so it remains clickable.
        expect(frame.querySelector('header')).toHaveClass('relative', 'z-10');
        expect(screen.getByRole('button', { name: 'CS' })).toBeEnabled();
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
    });
});
