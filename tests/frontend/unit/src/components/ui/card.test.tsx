import type { SVGProps } from 'react';
import { describe, expect, it } from 'vitest';

import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { renderWithoutProviders, screen } from '@test/render';

// lucide-react is not resolvable from the external test root; stub icons with
// the same props contract are enough for these assertions.
const FileText = (props: SVGProps<SVGSVGElement>) => <svg {...props} />;

/**
 * Audit 2026-09-30 §4.10 / roadmap 1.6 (D5, D7, DS-08): `glass` is the canonical
 * card surface, nested panels use `tone="nested"`, padding is one step on the
 * card, and section titles are headings with the §4.5 role recipes.
 */

describe('Card', () => {
    it('renders the canonical glass surface with the default p-6 padding', () => {
        renderWithoutProviders(<Card data-testid="card">Body</Card>);
        const card = screen.getByTestId('card');
        expect(card.tagName).toBe('DIV');
        expect(card).toHaveClass('glass', 'rounded-2xl', 'p-6');
        expect(card).not.toHaveClass('bg-card');
    });

    it('supports the padding steps, element and interactive hover', () => {
        renderWithoutProviders(
            <>
                <Card data-testid="none" padding="none" as="section" />
                <Card data-testid="compact" padding="compact" as="article" interactive />
            </>,
        );
        const none = screen.getByTestId('none');
        expect(none.tagName).toBe('SECTION');
        expect(none).toHaveClass('p-0');
        expect(none).not.toHaveClass('p-6');
        const compact = screen.getByTestId('compact');
        expect(compact.tagName).toBe('ARTICLE');
        expect(compact).toHaveClass('p-4', 'interactive-card');
    });

    it('uses a solid nested surface instead of glass-in-glass', () => {
        renderWithoutProviders(
            <Card data-testid="outer">
                <Card data-testid="inner" tone="nested" padding="compact" />
            </Card>,
        );
        const inner = screen.getByTestId('inner');
        expect(inner).toHaveClass('bg-nested', 'border-border', 'rounded-xl', 'text-nested-foreground');
        expect(inner).not.toHaveClass('glass');
    });
});

describe('CardHeader / CardTitle', () => {
    it('renders an h2 section title by default with eyebrow, description and actions', () => {
        renderWithoutProviders(
            <Card>
                <CardHeader
                    title="Recent activity"
                    eyebrow="Overview"
                    description="Latest control executions"
                    actions={<button type="button">Refresh</button>}
                    icon={FileText}
                    titleId="recent-title"
                />
                <CardBody>Rows</CardBody>
                <CardFooter>
                    <button type="button">Save</button>
                </CardFooter>
            </Card>,
        );
        const heading = screen.getByRole('heading', { level: 2, name: 'Recent activity' });
        expect(heading).toHaveAttribute('id', 'recent-title');
        expect(heading).toHaveClass('font-heading', 'text-xl', 'font-semibold', 'text-foreground');
        expect(heading.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('Overview')).toHaveClass('text-eyebrow');
        expect(screen.getByText('Latest control executions')).toHaveClass('text-muted-foreground');
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('border-t', 'border-border', 'justify-end');
    });

    it('renders an h3 subsection title when asked', () => {
        renderWithoutProviders(
            <>
                <CardHeader title="Details" titleAs="h3" />
                <CardTitle as="h3">Standalone</CardTitle>
            </>,
        );
        expect(screen.getByRole('heading', { level: 3, name: 'Details' })).toHaveClass('text-base', 'font-semibold');
        expect(screen.getByRole('heading', { level: 3, name: 'Standalone' })).toHaveClass('font-heading');
    });
});
