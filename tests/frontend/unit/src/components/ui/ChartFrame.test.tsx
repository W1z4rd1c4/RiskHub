import * as axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChartFrame } from '@/components/ui/ChartFrame';
import { renderWithoutProviders, screen, within } from '@test/render';

/**
 * Audit 2026-09-30 §4.15 / GAP-D-11: every chart has a text alternative (a
 * named figure plus a visually hidden data table), a legend that never relies
 * on colour alone, and one empty state.
 */

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

const TABLE = {
    columns: ['Period', 'All new', 'Critical'],
    rows: [
        { key: '2026-01', header: '2026-01', cells: [4, 1] },
        { key: '2026-02', header: '2026-02', cells: [6, 2] },
    ],
};

describe('ChartFrame', () => {
    it('names the chart region with the summary and repeats the data as a hidden table', () => {
        renderWithoutProviders(
            <ChartFrame summary="Area chart of new risks. All new: 10; critical: 3." table={TABLE} testId="trend">
                <svg data-testid="plot" />
            </ChartFrame>,
        );

        const figure = screen.getByRole('figure', { name: 'Area chart of new risks. All new: 10; critical: 3.' });
        expect(figure).toHaveAttribute('data-testid', 'trend');
        expect(within(figure).getByTestId('plot')).toBeInTheDocument();

        const table = within(figure).getByRole('table');
        expect(table).toHaveClass('sr-only');
        expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
            'Period',
            'All new',
            'Critical',
        ]);
        const row = within(table).getByRole('row', { name: /2026-02/ });
        expect(within(row).getByRole('rowheader')).toHaveTextContent('2026-02');
        expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['6', '2']);
    });

    it('renders a text legend with token swatches, so no series is identified by colour alone', () => {
        const { container } = renderWithoutProviders(
            <ChartFrame
                summary="Donut chart"
                legend={[
                    { key: 'high', label: 'High', color: 'hsl(var(--severity-high))', value: '3' },
                    { key: 'low', label: 'Low', color: 'hsl(var(--success))' },
                ]}
            >
                <svg />
            </ChartFrame>,
        );

        const legend = container.querySelector('[data-chart-legend]');
        expect(legend).not.toBeNull();
        const items = within(legend as HTMLElement).getAllByRole('listitem');
        expect(items.map((item) => item.textContent)).toEqual(['High 3', 'Low']);
        // Legend text uses the AA text tokens (riskhub legend contrast residual), never the series colour.
        expect(legend).toHaveClass('text-muted-foreground');
        const swatches = (legend as HTMLElement).querySelectorAll('svg circle');
        expect(Array.from(swatches).map((circle) => circle.getAttribute('fill'))).toEqual([
            'hsl(var(--severity-high))',
            'hsl(var(--success))',
        ]);
        expect((legend as HTMLElement).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('turns legend items into pressed-state toggles when they filter', async () => {
        const onLegendSelect = vi.fn();
        renderWithoutProviders(
            <ChartFrame
                summary="Controls by status"
                legend={[
                    { key: 'active', label: 'Active', color: 'hsl(var(--success))', value: '4' },
                    { key: 'inactive', label: 'Inactive', color: 'hsl(var(--chart-8))', value: '1' },
                ]}
                onLegendSelect={onLegendSelect}
                selectedLegendKey="active"
            >
                <svg />
            </ChartFrame>,
        );

        expect(screen.getByRole('button', { name: 'Active 4' })).toHaveAttribute('aria-pressed', 'true');
        const inactive = screen.getByRole('button', { name: 'Inactive 1' });
        expect(inactive).toHaveAttribute('aria-pressed', 'false');
        expect(inactive).toHaveAttribute('type', 'button');

        inactive.focus();
        await userEvent.keyboard('{Enter}');
        expect(onLegendSelect).toHaveBeenCalledWith('inactive');
    });

    it('renders one announced empty state instead of an empty plot', () => {
        renderWithoutProviders(
            <ChartFrame summary="Bar chart" isEmpty emptyTitle="No open issues." table={TABLE} testId="aging">
                <svg data-testid="plot" />
            </ChartFrame>,
        );

        expect(screen.getByRole('status')).toHaveTextContent('No open issues.');
        expect(screen.getByTestId('aging')).toHaveAttribute('role', 'status');
        expect(screen.queryByTestId('plot')).not.toBeInTheDocument();
        expect(screen.queryByRole('figure')).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('forwards its ref to the figure and has the primitive displayName', () => {
        const ref = createRef<HTMLElement>();
        renderWithoutProviders(
            <ChartFrame ref={ref} summary="Chart">
                <svg />
            </ChartFrame>,
        );
        expect(ref.current?.tagName).toBe('FIGURE');
        expect(ChartFrame.displayName).toBe('ChartFrame');
    });

    it('has no structural axe violations', async () => {
        const { container } = renderWithoutProviders(
            <main>
                <ChartFrame
                    summary="Bar chart of open issues by age. Open issues: 10."
                    table={TABLE}
                    legend={[{ key: 'open', label: 'Open issues', color: 'hsl(var(--chart-1))', value: '10' }]}
                    onLegendSelect={vi.fn()}
                >
                    <svg aria-hidden="true" />
                </ChartFrame>
                <ChartFrame summary="Empty chart" isEmpty emptyTitle="No data">
                    <svg aria-hidden="true" />
                </ChartFrame>
            </main>,
        );
        await expectNoAxeViolations(container);
    });
});
