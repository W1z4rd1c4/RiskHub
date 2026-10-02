import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CategoryBreakdownCharts } from '@/components/dashboard/CategoryBreakdownCharts';
import { IssueAgingChart } from '@/components/dashboard/IssueAgingChart';
import { KRIBreachHistoryChart } from '@/components/dashboard/KRIBreachHistoryChart';
import { OpenIssuesBySeverityChart } from '@/components/dashboard/OpenIssuesBySeverityChart';
import { RiskDistributionMatrix } from '@/components/dashboard/RiskDistributionMatrix';
import { RiskTrendChart } from '@/components/dashboard/RiskTrendChart';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import i18n from '@/i18n';

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({ thresholds: { critical: 16, high: 10, medium: 5 } }),
}));

/**
 * Audit 2026-09-30 GAP-D-11 / D1 / Phase 3g: dashboard charts carry a text
 * alternative (named figure + data table), a token-coloured text legend instead
 * of colour-only series, one empty state, translated codes (GAP-D-02) and Czech
 * plural forms.
 */

afterEach(async () => {
    await act(async () => {
        await i18n.changeLanguage('en');
    });
});

async function useCzech(): Promise<void> {
    await act(async () => {
        await i18n.changeLanguage('cs');
    });
}

describe('dashboard charts — text alternatives (GAP-D-11)', () => {
    it('names the issue-aging chart and lists every bucket in a data table', () => {
        render(
            <IssueAgingChart
                buckets={[
                    { bucket: '0-7', count: 6 },
                    { bucket: '8-30', count: 4 },
                ]}
            />,
        );

        const figure = screen.getByRole('figure', { name: /Open issues: 10/ });
        const table = within(figure).getByRole('table');
        expect(within(table).getByRole('columnheader', { name: 'Age (days)' })).toBeInTheDocument();
        expect(within(table).getByRole('row', { name: /8-30/ })).toHaveTextContent('4');
    });

    it('replaces an all-zero issue chart with one announced empty state', () => {
        render(<IssueAgingChart buckets={[{ bucket: '0-7', count: 0 }]} />);
        expect(screen.getByRole('status')).toHaveTextContent('No open issues.');
        expect(screen.queryByRole('figure')).not.toBeInTheDocument();

        render(<OpenIssuesBySeverityChart items={[]} />);
        expect(screen.getAllByRole('status')).toHaveLength(2);
    });

    it('labels every severity slice in a legend coloured by the D1 band tokens', () => {
        const { container } = render(
            <OpenIssuesBySeverityChart
                items={[
                    { severity: 'high', count: 3 },
                    { severity: 'low', count: 2 },
                ]}
            />,
        );

        const legend = container.querySelector('[data-chart-legend]') as HTMLElement;
        expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['High 3', 'Low 2']);
        const fills = Array.from(legend.querySelectorAll('circle')).map((circle) => circle.getAttribute('fill'));
        expect(fills[0]).toContain('--severity-high');
        expect(fills[1]).toContain('--success');
        expect(screen.getByRole('figure', { name: /Open issues: 5/ })).toBeInTheDocument();
    });

    it('renders trend legends as token text instead of the Recharts colour-only legend', () => {
        const { container } = render(
            <>
                <RiskTrendChart data={[{ period: '2026-01', total_new: 4, critical_new: 1 }]} />
                <KRIBreachHistoryChart data={[{ period: '2026-01', total_entries: 9, breached_entries: 2 }]} />
            </>,
        );

        expect(screen.getByRole('figure', { name: /All new: 4; critical: 1/ })).toBeInTheDocument();
        expect(screen.getByRole('figure', { name: /Samples: 9; breaches: 2/ })).toBeInTheDocument();
        const legends = Array.from(container.querySelectorAll<HTMLElement>('[data-chart-legend]'));
        expect(legends.map((legend) => legend.textContent)).toEqual(['All NewCritical', 'Total SamplesBreaches']);
        legends.forEach((legend) => expect(legend).toHaveClass('text-muted-foreground'));
        expect(container.querySelector('.recharts-legend-wrapper')).toBeNull();
    });

    it('shows the shared empty state for an empty trend', () => {
        render(<RiskTrendChart data={[]} />);
        expect(screen.getByRole('status')).toHaveTextContent('No risk trend data available.');
    });
});

describe('control breakdown — translated codes and keyboard filter (GAP-D-02, GAP-D-11)', () => {
    it('translates category codes and exposes the segment filter as pressed-state legend buttons', async () => {
        await useCzech();
        render(
            <DashboardFilterProvider>
                <CategoryBreakdownCharts
                    controlsByStatus={{ active: 3, inactive: 1 }}
                    controlsByForm={{ manual: 2 }}
                    controlsByFrequency={{ ad_hoc: 1, 'semi-annually': 2 }}
                />
            </DashboardFilterProvider>,
        );

        const status = screen.getByTestId('control-breakdown-status');
        const active = within(status).getByRole('button', { name: 'Aktivní 3' });
        expect(active).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(active);
        expect(within(screen.getByTestId('control-breakdown-status')).getByRole('button', { name: 'Aktivní 3' }))
            .toHaveAttribute('aria-pressed', 'true');

        // The frequency donut does not filter, so its legend is plain text.
        const frequency = screen.getByTestId('control-breakdown-frequency');
        expect(within(frequency).queryByRole('button')).not.toBeInTheDocument();
        expect(frequency).toHaveTextContent('Ad hoc');
        expect(frequency).toHaveTextContent('Pololetně');
        expect(screen.getByRole('heading', { level: 3, name: 'Podle frekvence' })).toBeInTheDocument();
    });
});

describe('risk distribution matrix — Czech plurals and named cells', () => {
    it('agrees the cell label with the count and names each cell with its band', async () => {
        await useCzech();
        render(
            <RiskDistributionMatrix
                distribution={[
                    { probability: 1, impact: 1, count: 1 },
                    { probability: 2, impact: 2, count: 2 },
                    { probability: 4, impact: 4, count: 5 },
                ]}
                onCellClick={vi.fn()}
            />,
        );

        const one = screen.getByRole('button', { name: /^Zobrazit 1 riziko při pravděpodobnosti 1, dopadu 1 \(Nízké\)$/ });
        expect(one).toHaveTextContent('Riziko');
        const two = screen.getByRole('button', { name: /^Zobrazit 2 rizika při pravděpodobnosti 2, dopadu 2 \(Nízké\)$/ });
        expect(two).toHaveTextContent('Rizika');
        const five = screen.getByRole('button', { name: /^Zobrazit 5 rizik při pravděpodobnosti 4, dopadu 4 \(Kritické\)$/ });
        expect(five).toHaveTextContent('Rizik');
        expect(screen.getByRole('list', { name: 'Úrovně rizika' })).toHaveTextContent('Kritické');
    });
});

describe('dashboard Czech plural families', () => {
    it.each([
        ['dashboard:kri.days_overdue', 1, '1 den po termínu'],
        ['dashboard:kri.days_overdue', 3, '3 dny po termínu'],
        ['dashboard:kri.days_overdue', 7, '7 dní po termínu'],
        ['dashboard:kri.days_until_due', 2, 'zbývají 2 dny'],
        ['dashboard:kri.upcoming_count', 1, '1 nadcházející'],
        ['ictRegisterCommittee:roi.row_count', 2, '2 řádky'],
        ['ictRegisterCommittee:roi.row_count', 1, '1 řádek'],
    ])('%s with count %d reads "%s"', (key, count, expected) => {
        expect(i18n.t(key, { count, lng: 'cs' })).toBe(expected);
    });
});
