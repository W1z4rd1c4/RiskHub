import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, type ComponentType } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PageHeader } from '@/components/layout/PageHeader';
import { MainLayout } from '@/components/layout/MainLayout';
import i18n from '@/i18n';

// The shell's own chrome needs auth, polling and permissions; the contract under
// test here is only what `MainLayout` does around the routed page.
vi.mock('@/components/layout', () => ({
    DesktopOnlyNotice: () => null,
    Sidebar: () => (
        <nav aria-label="Sidebar">
            <Link to="/alpha">Alpha</Link>
            <Link to="/beta">Beta</Link>
            <Link to="/lazy">Lazy</Link>
        </nav>
    ),
}));

let resolveLazyPage: (() => void) | null = null;
const LazyPage = lazy(() => new Promise<{ default: ComponentType }>((resolve) => {
    resolveLazyPage = () => resolve({ default: () => <PageHeader title="Lazy page" /> });
}));

function renderShell(initialPath = '/alpha') {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route element={<MainLayout />}>
                    <Route path="/alpha" element={<PageHeader title="Alpha page" />} />
                    <Route path="/beta" element={<PageHeader title="Beta page" />} />
                    <Route path="/lazy" element={<LazyPage />} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );
}

afterEach(async () => {
    resolveLazyPage = null;
    await i18n.changeLanguage('en');
    document.title = '';
});

describe('MainLayout route shell (NAV-01, NAV-04, D14)', () => {
    it('renders the page inside the main landmark with an empty polite announcer on first load', () => {
        renderShell();

        const main = screen.getByRole('main');
        expect(within(main).getByRole('heading', { level: 1, name: 'Alpha page' })).not.toHaveFocus();
        const announcer = screen.getByTestId('route-announcer');
        expect(announcer).toHaveAttribute('aria-live', 'polite');
        expect(announcer).toHaveAttribute('role', 'status');
        expect(announcer).toBeEmptyDOMElement();
    });

    it('moves focus to the new page h1 and announces the translated document title after navigation', async () => {
        const user = userEvent.setup();
        renderShell();

        await user.click(screen.getByRole('link', { name: 'Beta' }));

        const heading = await screen.findByRole('heading', { level: 1, name: 'Beta page' });
        await waitFor(() => expect(heading).toHaveFocus());
        await waitFor(() => expect(screen.getByTestId('route-announcer')).toHaveTextContent('Beta page · RiskHub'));
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('shows the page loading state inside the shell, sidebar mounted, while a lazy route loads', async () => {
        // React Router wraps in-app navigations in a transition, so the previous page
        // stays visible then; the fallback covers a lazy page's first load in the shell.
        renderShell('/lazy');

        const main = screen.getByRole('main');
        expect(within(main).getByRole('status')).toHaveTextContent(i18n.t('common:loading.generic'));
        expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();

        await act(async () => {
            resolveLazyPage?.();
        });

        expect(await within(main).findByRole('heading', { level: 1, name: 'Lazy page' })).toBeInTheDocument();
        expect(within(main).queryByRole('status')).not.toBeInTheDocument();
        expect(document.title).toBe('Lazy page · RiskHub');
    });
});
