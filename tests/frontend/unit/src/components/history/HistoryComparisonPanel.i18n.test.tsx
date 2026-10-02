import { afterAll, describe, expect, it } from 'vitest';

import { HistoryComparisonPanel } from '@/components/history/HistoryComparisonPanel';
import i18n from '@/i18n';
import type { KRIHistoryEntry } from '@/types/kri';
import { renderWithoutProviders, screen } from '@test/render';

function entry(overrides: Partial<KRIHistoryEntry>): KRIHistoryEntry {
    return {
        id: 1,
        kri_id: 9,
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        recorded_at: '2026-07-01T08:00:00Z',
        value: 3,
        lower_limit: 0,
        upper_limit: 5,
        unit: 'days',
        breach_status: 'within',
        recorded_by_name: 'Alice',
        ...overrides,
    };
}

/** Audit GAP-D-03 / GAP-D-04: translated breach status and units; two distinctly named selects. */
describe('HistoryComparisonPanel i18n', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        ['en', 'Within limits', 'Above upper limit', 'Baseline record', 'Compared record', '7 days'],
        ['cs', 'V limitu', 'Nad horním limitem', 'Výchozí záznam', 'Porovnávaný záznam', '7 dní'],
    ] as const)('renders translated statuses, units and select names in %s', async (
        language, within, above, baseline, target, value,
    ) => {
        await i18n.changeLanguage(language);
        renderWithoutProviders(
            <HistoryComparisonPanel
                formatValue={(n) => String(n)}
                entries={[
                    entry({ id: 1, period_end: '2026-06-30', value: 3, breach_status: 'within' }),
                    entry({ id: 2, period_end: '2026-07-31', value: 7, breach_status: 'above' }),
                ]}
            />,
        );

        expect(screen.getByRole('combobox', { name: baseline })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: target })).toBeInTheDocument();
        expect(screen.getAllByText(within).length).toBeGreaterThan(0);
        expect(screen.getAllByText(above).length).toBeGreaterThan(0);
        expect(screen.queryByText('WITHIN')).not.toBeInTheDocument();
        expect(screen.queryByText('ABOVE')).not.toBeInTheDocument();
        expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    });
});
