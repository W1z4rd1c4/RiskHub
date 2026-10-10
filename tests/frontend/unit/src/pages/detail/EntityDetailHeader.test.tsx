import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { PAGE_TITLE_CLASS } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import i18n from '@/i18n';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('EntityDetailHeader', () => {
    it('keeps identifier, title, status, metadata, description, and actions in one semantic header', () => {
        render(
            <EntityDetailHeader
                back={{ label: 'Back to Risks', onClick: () => undefined }}
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
        expect(screen.getByRole('button', { name: 'Back to Risks' })).toHaveAttribute('type', 'button');
    });

    it('omits the optional identifier and separator together', () => {
        render(
            <EntityDetailHeader
                identifierSeparatorLabel="Identifier separator"
                title="Asset name"
            />,
        );

        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Asset name' })).toBeVisible();
    });

    it('uses the shared D7 page-title recipe', () => {
        render(<EntityDetailHeader title="Risk A" />);
        const heading = screen.getByRole('heading', { level: 1, name: 'Risk A' });
        expect(heading).toHaveClass(...PAGE_TITLE_CLASS.split(' '));
        expect(heading.className).not.toMatch(/font-black|text-4xl|tracking-tighter/);
    });

    it('lets every breadcrumb label shrink and wrap without truncating record names', () => {
        const ancestor = `Group${'UNBROKEN'.repeat(18)}`;
        const register = `Register${'UNBROKEN'.repeat(18)}`;
        const record = `Record${'UNBROKEN'.repeat(18)}`;
        render(
            <MemoryRouter>
                <EntityDetailHeader
                    title={record}
                    breadcrumbs={[{ label: ancestor }, { label: register, to: '/vendors' }, { label: record }]}
                />
            </MemoryRouter>,
        );

        const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
        expect(trail).toHaveClass('min-w-0', 'max-w-full', '[overflow-wrap:anywhere]');
        trail.querySelectorAll('li').forEach((item) => {
            expect(item).toHaveClass('min-w-0', 'max-w-full');
        });
        const labels = [
            screen.getByText(ancestor),
            screen.getByRole('link', { name: register }),
            screen.getByText(record, { selector: '[aria-current="page"]' }),
        ];
        labels.forEach((label) => {
            expect(label).toHaveClass('min-w-0');
            ['break-words', 'truncate', 'overflow-hidden', 'whitespace-nowrap'].forEach((className) => {
                expect(label).not.toHaveClass(className);
            });
        });
        expect(labels.map((label) => label.textContent)).toEqual([ancestor, register, record]);
        expect(labels[1]).toHaveAttribute('href', '/vendors');
    });

    it('keeps one anywhere wrapping rule and lets wrapped actions grow above their minimum target height', () => {
        const title = `Vendor ${'UNBROKEN'.repeat(18)}`;
        const description = `Long localized description\nSecond authored line ${'DETAIL'.repeat(24)}`;
        const actionLabel = 'DELIBERATELYLONGUNBROKENACTION'.repeat(6);
        render(
            <EntityDetailHeader
                title={title}
                metadata={<span>Operations</span>}
                description={description}
                statuses={<span>Active</span>}
                supplementary={<span>Significant vendor</span>}
                actions={(
                    <>
                        <Button>{actionLabel}</Button>
                        <Button size="icon" aria-label="Edit vendor"><svg aria-hidden="true" /></Button>
                    </>
                )}
            />,
        );

        const heading = screen.getByRole('heading', { level: 1 });
        const metadata = screen.getByText('Operations').parentElement;
        const descriptionElement = screen.getByText(/^Long localized description/);
        [heading, metadata, descriptionElement].forEach((element) => {
            expect(element).toHaveClass('[overflow-wrap:anywhere]');
            // Tailwind can emit break-words after the arbitrary anywhere utility.
            // Keep a single overflow-wrap declaration so intrinsic sizing stays safe.
            expect(element).not.toHaveClass('break-words');
        });
        expect(heading.textContent).toBe(title);
        expect(descriptionElement.textContent).toBe(description);
        expect(descriptionElement).toHaveClass('whitespace-pre-wrap');

        const action = screen.getByRole('button', { name: actionLabel });
        [screen.getByText('Active'), screen.getByText('Significant vendor'), action].forEach((element) => {
            expect(element.parentElement).toHaveClass(
                '[&>*]:max-w-full', '[&>*]:whitespace-normal', '[&>*]:[overflow-wrap:anywhere]',
            );
            expect(element.parentElement).not.toHaveClass('[&>*]:break-words');
        });
        expect(action.parentElement).toHaveClass('[&>button]:h-auto', '[&>button]:min-h-10');
        expect(action.textContent).toBe(actionLabel);
        expect(screen.getByRole('button', { name: 'Edit vendor' })).toHaveClass('w-10');
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
        const { unmount } = render(<EntityDetailHeader title="Vendor outage" />);
        expect(document.title).toBe('Vendor outage · RiskHub');
        unmount();
        render(<EntityDetailHeader title={<span>Rich</span>} documentTitle="KRI 7" />);
        expect(document.title).toBe('KRI 7 · RiskHub');
    });
});
