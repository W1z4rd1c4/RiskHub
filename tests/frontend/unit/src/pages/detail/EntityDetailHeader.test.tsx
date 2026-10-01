import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { PAGE_TITLE_CLASS } from '@/components/layout/PageHeader';
import i18n from '@/i18n';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('EntityDetailHeader', () => {
    it('keeps identifier, title, status, metadata, description, and actions in one semantic header', () => {
        render(
            <EntityDetailHeader
                backAction={<button type="button">Back</button>}
                identifier="RISK-WITH-A-VERY-LONG-UNBROKEN-IDENTIFIER"
                identifierSeparatorLabel="Identifier separator"
                title="A very long decision-record title"
                statuses={<span>Active</span>}
                metadata={<span>Operations</span>}
                description="A long description that must remain readable."
                actions={<button type="button">Edit</button>}
            />,
        );

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A very long decision-record title');
        expect(screen.getByText('RISK-WITH-A-VERY-LONG-UNBROKEN-IDENTIFIER')).toBeVisible();
        expect(screen.getByRole('separator', { name: 'Identifier separator' })).toBeVisible();
        expect(screen.getByText('Active')).toBeVisible();
        expect(screen.getByText('Operations')).toBeVisible();
        expect(screen.getByText('A long description that must remain readable.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    it('omits the optional identifier and separator together', () => {
        render(
            <EntityDetailHeader
                backAction={<button type="button">Back</button>}
                identifierSeparatorLabel="Identifier separator"
                title="Asset name"
            />,
        );

        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Asset name' })).toBeVisible();
    });

    it('uses the shared D7 page-title recipe', () => {
        render(<EntityDetailHeader backAction={<span />} title="Risk A" />);
        const heading = screen.getByRole('heading', { level: 1, name: 'Risk A' });
        expect(heading).toHaveClass(...PAGE_TITLE_CLASS.split(' '));
        expect(heading.className).not.toMatch(/font-black|text-4xl|tracking-tighter/);
    });

    it('renders a labelled back link, breadcrumbs and the default separator name (D14, NAV-02, AX-06)', async () => {
        await i18n.changeLanguage('cs');
        render(
            <MemoryRouter>
                <EntityDetailHeader
                    back={{ label: 'Zpět na oddělení', to: '/departments' }}
                    breadcrumbs={[{ label: 'Oddělení', to: '/departments' }, { label: 'Provoz' }]}
                    identifier="OPS"
                    title="Provoz"
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: 'Zpět na oddělení' })).toHaveAttribute('href', '/departments');
        const trail = screen.getByRole('navigation', { name: 'Drobečková navigace' });
        expect(trail).toHaveTextContent('Oddělení');
        expect(screen.getByText('Provoz', { selector: '[aria-current="page"]' })).toBeInTheDocument();
        expect(screen.getByRole('separator', { name: 'Oddělovač identifikátoru' })).toBeInTheDocument();
    });

    it('sets the per-route document title from the title or documentTitle (NAV-01)', () => {
        const { unmount } = render(<EntityDetailHeader backAction={<span />} title="Vendor outage" />);
        expect(document.title).toBe('Vendor outage · RiskHub');
        unmount();
        render(<EntityDetailHeader backAction={<span />} title={<span>Rich</span>} documentTitle="KRI 7" />);
        expect(document.title).toBe('KRI 7 · RiskHub');
    });
});
