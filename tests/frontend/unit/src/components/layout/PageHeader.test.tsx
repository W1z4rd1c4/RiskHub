import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import type { LucideIcon } from 'lucide-react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageContainer } from '@/components/layout/PageContainer';
import { PAGE_TITLE_CLASS, PageHeader } from '@/components/layout/PageHeader';
import i18n from '@/i18n';
import { renderWithoutProviders, screen } from '@test/render';

// lucide-react is not forwarded to the test tree; any SVG component stands in for an icon.
const Settings = ((props: Record<string, unknown>) => <svg data-testid="test-icon" {...props} />) as unknown as LucideIcon;

/**
 * Audit 2026-09-30 §4.6 / §4.14, roadmap 1.10 (D7, D11, D14; DS-15, DS-16,
 * NAV-01, NAV-02, AX-06): one `h1` with one recipe, labelled back navigation,
 * a named breadcrumb landmark, the per-route translated `document.title`, and
 * the single page container.
 */

const BASE_TITLE = 'RiskHub — Enterprise Risk Management';

beforeEach(() => {
    document.title = BASE_TITLE;
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

function renderInRouter(ui: ReactNode, initialEntry = '/settings') {
    return renderWithoutProviders(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path={initialEntry} element={ui} />
                <Route path="/risks" element={<p>Risk register</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('PageHeader', () => {
    it('renders exactly one h1 with the D7 recipe plus eyebrow, description, icon and actions', () => {
        const { container } = renderInRouter(
            <PageHeader
                icon={Settings}
                eyebrow="Administration"
                title="Platform Settings"
                description="Manage your preferences"
                actions={<button type="button">Save</button>}
            />,
        );

        const headings = screen.getAllByRole('heading', { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent('Platform Settings');
        expect(headings[0]).toHaveClass(...PAGE_TITLE_CLASS.split(' '));
        expect(headings[0]).toHaveAttribute('tabindex', '-1');
        expect(headings[0]).toHaveAttribute('data-page-title');
        expect(screen.getByText('Administration')).toHaveClass('text-eyebrow');
        expect(screen.getByText('Manage your preferences')).toHaveClass('text-muted-foreground');
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(container.querySelector('header svg')).toHaveAttribute('aria-hidden', 'true');
        expect(PAGE_TITLE_CLASS).toBe('font-heading text-3xl font-bold tracking-tight text-foreground');
    });

    it('sets the translated document title and restores it on unmount', async () => {
        const { unmount } = renderInRouter(<PageHeader title="Platform Settings" />);
        expect(document.title).toBe('Platform Settings · RiskHub');
        unmount();
        expect(document.title).toBe(BASE_TITLE);

        await i18n.changeLanguage('cs');
        renderInRouter(<PageHeader title="Nastavení platformy" />);
        expect(document.title).toBe('Nastavení platformy · RiskHub');
    });

    it('prefers documentTitle and skips the title for non-string titles without one', () => {
        const { unmount } = renderInRouter(<PageHeader title={<span>Rich</span>} />);
        expect(document.title).toBe(BASE_TITLE);
        unmount();
        renderInRouter(<PageHeader title={<span>Rich</span>} documentTitle="Risk 42" />);
        expect(document.title).toBe('Risk 42 · RiskHub');
    });

    it('renders a destination-labelled back link that navigates', async () => {
        const user = userEvent.setup();
        renderInRouter(<PageHeader title="New risk" back={{ label: 'Back to Risks', to: '/risks' }} />, '/risks/new');
        const back = screen.getByRole('link', { name: 'Back to Risks' });
        expect(back).toHaveAttribute('href', '/risks');
        await user.click(back);
        expect(await screen.findByText('Risk register')).toBeInTheDocument();
    });

    it('renders an onClick back control as a non-submitting button', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        renderInRouter(<PageHeader title="Edit risk" back={{ label: 'Back to Risk A', onClick }} />);
        const back = screen.getByRole('button', { name: 'Back to Risk A' });
        expect(back).toHaveAttribute('type', 'button');
        await user.click(back);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('renders breadcrumbs with the current page last', () => {
        renderInRouter(
            <PageHeader
                title="Edit risk"
                breadcrumbs={[{ label: 'Risks', to: '/risks' }, { label: 'Risk A', to: '/risks/1' }, { label: 'Edit' }]}
            />,
        );
        const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
        expect(nav.querySelectorAll('li')).toHaveLength(3);
        expect(screen.getByRole('link', { name: 'Risks' })).toHaveAttribute('href', '/risks');
        expect(screen.getByText('Edit', { selector: '[aria-current="page"]' })).toBeInTheDocument();
    });
});

describe('Breadcrumbs', () => {
    it('names the landmark in Czech and never links the current page', async () => {
        await i18n.changeLanguage('cs');
        renderInRouter(<Breadcrumbs items={[{ label: 'Oddělení', to: '/departments' }, { label: 'Provoz', to: '/departments/3' }]} />);
        expect(screen.getByRole('navigation', { name: 'Drobečková navigace' })).toBeInTheDocument();
        expect(screen.getAllByRole('link')).toHaveLength(1);
        const current = screen.getByText('Provoz');
        expect(current).toHaveAttribute('aria-current', 'page');
        expect(current.tagName).toBe('SPAN');
    });

    it('renders nothing for an empty trail', () => {
        const { container } = renderInRouter(<Breadcrumbs items={[]} />);
        expect(container.querySelector('nav')).toBeNull();
    });
});

describe('PageContainer', () => {
    it.each([
        ['default', ['max-w-page', 'mx-auto', 'w-full', 'space-y-8']],
        ['form', ['max-w-form', 'mx-auto', 'w-full', 'space-y-8']],
        ['prose', ['max-w-prose']],
    ] as const)('applies the %s width and rhythm without outer padding', (size, expected) => {
        renderWithoutProviders(<PageContainer size={size} data-testid="page">content</PageContainer>);
        const page = screen.getByTestId('page');
        expect(page).toHaveClass(...expected);
        expect(page.className).not.toMatch(/(?:^|\s)p[xy]?-\d/);
    });
});
