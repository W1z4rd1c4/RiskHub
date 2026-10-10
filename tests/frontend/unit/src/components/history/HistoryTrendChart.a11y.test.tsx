import { afterAll, describe, expect, it } from 'vitest';

import { HistoryTrendChart } from '@/components/history/HistoryTrendChart';
import i18n from '@/i18n';
import { renderWithoutProviders, screen, within } from '@test/render';

const points = [
    { label: 'Jan', value: 4 },
    { label: 'Feb', value: 9 },
    { label: 'Mar', value: 6 },
];

/** Audit GAP-D-11: the KRI history trend renders through `ChartFrame` like the dashboard charts. */
describe('HistoryTrendChart text alternative', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('names the chart with a summary of the latest value and range', () => {
        renderWithoutProviders(<HistoryTrendChart data={points} valueLabel="Days" />);

        expect(
            screen.getByRole('figure', { name: 'Days trend: latest value 6 (Mar); lowest 4, highest 9.' }),
        ).toBeInTheDocument();
    });

    it('repeats the plotted values as a data table', () => {
        renderWithoutProviders(<HistoryTrendChart data={points} valueLabel="Days" />);

        const table = screen.getByRole('table');
        expect(within(table).getByRole('columnheader', { name: 'Period' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: 'Days' })).toBeInTheDocument();
        const febRow = within(table).getByRole('rowheader', { name: 'Feb' }).closest('tr') as HTMLElement;
        expect(within(febRow).getByRole('cell', { name: '9' })).toBeInTheDocument();
    });

    it('renders the shared empty state instead of an empty plot', () => {
        renderWithoutProviders(<HistoryTrendChart data={[]} emptyMessage="No history yet" />);

        expect(screen.getByRole('status')).toHaveTextContent('No history yet');
        expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    });

    it('summarises in Czech', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(<HistoryTrendChart data={points} valueLabel="Dny" />);

        expect(
            screen.getByRole('figure', { name: 'Vývoj – Dny: poslední hodnota 6 (Mar); nejnižší 4, nejvyšší 9.' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Období' })).toBeInTheDocument();
    });
});
