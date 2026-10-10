import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAvailablePeriodsMock = vi.fn();
const fetchQuarterlyComparisonMock = vi.fn();

vi.mock('@/services/dashboardApi', () => ({
    dashboardApi: {
        fetchAvailablePeriods: (...args: unknown[]) => fetchAvailablePeriodsMock(...args),
        fetchQuarterlyComparison: (...args: unknown[]) => fetchQuarterlyComparisonMock(...args),
    },
}));

vi.mock('@/i18n/hooks', async () => {
    const formatters = await vi.importActual<typeof import('@/i18n/formatters')>('@/i18n/formatters');
    return {
        useFormat: () => ({
            date: (value: string) => formatters.formatDateValue(value, 'en'),
            dateTime: (value: string) => formatters.formatDateTimeValue(value, 'en'),
        }),
        useTranslation: () => ({
            t: (key: string, options?: { period?: string }) => {
                if (key === 'quarterly.no_snapshot_banner') return `missing ${options?.period ?? ''}`;
                if (key === 'quarterly.comparison_unavailable') return 'Comparison unavailable';
                if (key === 'quarterly.missing_definition') return 'Metric definition unavailable';
                if (key === 'quarterly.not_available') return 'N/A';
                if (key === 'quarterly.new_from_zero') return `New (from 0) +${(options as { change?: number })?.change}`;
                if (key === 'quarterly.source.live') return 'Live';
                if (key === 'quarterly.source.stored') return 'Stored';
                if (key === 'quarterly.source.missing') return 'Missing';
                if (key === 'quarterly.vs') return 'vs';
                return key;
            },
        }),
    };
});

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        triggerAriaLabel,
        triggerTestId,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string; disabled?: boolean }>;
        triggerAriaLabel?: string;
        triggerTestId?: string;
    }) => (
        <select aria-label={triggerAriaLabel} data-testid={triggerTestId} value={value} onChange={(event) => onValueChange(event.target.value)}>
            {options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

import { QuarterlyComparisonWidget } from '@/components/dashboard/QuarterlyComparisonWidget';
import { QuarterMetricCard } from '@/components/dashboard/QuarterMetricCard';
import { formatDateTimeValue, formatDateValue } from '@/i18n/formatters';

const enDate = (value: string) => formatDateValue(value, 'en');
const enDateTime = (value: string) => formatDateTimeValue(value, 'en');

function comparisonPayload(overrides: Record<string, unknown> = {}) {
    return {
        this_quarter: { new_risks: 1, priority_risks: 4 },
        last_quarter: { new_risks: 0, priority_risks: 2 },
        changes: {
            new_risks: { absolute: 1, percentage: null, direction: 'unknown', reason: 'baseline_zero' },
            priority_risks: { absolute: 2, percentage: 100, direction: 'up' },
        },
        period: {
            this_start: '2026-04-01T00:00:00Z',
            this_end: '2026-04-23T00:00:00Z',
            last_start: '2026-01-01T00:00:00Z',
            last_end: '2026-01-23T00:00:00Z',
            window_type: 'equal_elapsed',
        },
        metric_observations: {
            new_risks: {
                metric_type: 'flow',
                current: { source: 'live', start: '2026-04-01T00:00:00Z', end: '2026-04-23T00:00:00Z' },
                compare: { source: 'live', start: '2026-01-01T00:00:00Z', end: '2026-01-23T00:00:00Z' },
            },
            priority_risks: {
                metric_type: 'stock',
                current: { source: 'live', observed_at: '2026-04-23T00:00:00Z' },
                compare: { source: 'stored', observed_at: '2026-01-20T12:00:00Z' },
            },
        },
        snapshot_info: {
            current_quarter: '2026-Q2',
            last_quarter: '2026-Q1',
            last_quarter_snapshot_available: true,
            current_quarter_snapshot_available: true,
            missing_snapshot_quarters: [],
            snapshot_sources: { current: 'live', compare: 'stored' },
            missing_snapshot_metrics: { current: [], compare: [] },
            period_metrics: ['new_risks'],
            snapshot_metrics: ['priority_risks', 'active_vendors'],
        },
        ...overrides,
    };
}

describe('QuarterlyComparisonWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchAvailablePeriodsMock.mockResolvedValue({
            years: [2025, 2026],
            current_quarter: '2026-Q2',
        });
        fetchQuarterlyComparisonMock.mockResolvedValue(comparisonPayload());
    });

    it('disables future current quarters and resets invalid compare quarters', async () => {
        render(<QuarterlyComparisonWidget />);

        await waitFor(() => expect(fetchQuarterlyComparisonMock).toHaveBeenCalledWith('2026-Q2', '2026-Q1'));

        const currentQuarter = screen.getByTestId('quarterly-current-quarter') as HTMLSelectElement;
        const compareQuarter = screen.getByTestId('quarterly-compare-quarter') as HTMLSelectElement;
        expect(currentQuarter.querySelector('option[value="3"]')).toBeDisabled();
        expect(compareQuarter.querySelector('option[value="2"]')).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'quarterly.current_quarter' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'quarterly.current_year' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'quarterly.compare_quarter' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'quarterly.compare_year' })).toBeInTheDocument();

        fireEvent.change(currentQuarter, { target: { value: '1' } });

        await waitFor(() => expect(fetchQuarterlyComparisonMock).toHaveBeenCalledWith('2026-Q1', '2025-Q4'));
    });

    it('shows exact equal-window evidence and a non-percentage baseline-zero change', async () => {
        render(<QuarterlyComparisonWidget />);

        expect(await screen.findByText('New (from 0) +1')).toBeInTheDocument();
        // Formatted for the locale; the exact instant stays machine-readable on <time dateTime>.
        const evidence = screen.getByLabelText('quarterly.observation_evidence');
        expect(within(evidence).getByText('2026-Q2 · Live')).toBeInTheDocument();
        expect(within(evidence).getByText('2026-Q1 · Live')).toBeInTheDocument();
        const priorityCard = screen.getByRole('group', { name: 'quarterly.priority_risks' });
        expect(priorityCard).toHaveTextContent(`2026-Q2 · Live ${enDateTime('2026-04-23T00:00:00Z')}`);
        expect(priorityCard).toHaveTextContent(`2026-Q1 · Stored ${enDateTime('2026-01-20T12:00:00Z')}`);
        expect(evidence).toHaveTextContent(`${enDate('2026-04-01T00:00:00Z')} – ${enDate('2026-04-23T00:00:00Z')}`);
        expect(evidence).toHaveTextContent(`${enDate('2026-01-01T00:00:00Z')} – ${enDate('2026-01-23T00:00:00Z')}`);
        expect(Array.from(evidence.querySelectorAll('time')).map((node) => node.getAttribute('datetime'))).toEqual([
            '2026-04-01T00:00:00Z',
            '2026-04-23T00:00:00Z',
            '2026-01-01T00:00:00Z',
            '2026-01-23T00:00:00Z',
        ]);
        expect(evidence).not.toHaveTextContent('2026-04-01T00:00:00Z');
    });

    it('shows each stock metric\'s own observation sources and times', async () => {
        fetchQuarterlyComparisonMock.mockResolvedValue(comparisonPayload({
            this_quarter: { new_risks: 1, priority_risks: 4, active_vendors: 5 },
            last_quarter: { new_risks: 0, priority_risks: 2 },
            changes: {
                new_risks: { absolute: 1, percentage: null, direction: 'unknown', reason: 'baseline_zero' },
                priority_risks: { absolute: 2, percentage: 100, direction: 'up' },
                active_vendors: {
                    absolute: null,
                    percentage: null,
                    direction: 'unknown',
                    reason: 'missing_observation',
                },
            },
            metric_observations: {
                new_risks: {
                    metric_type: 'flow',
                    current: { source: 'live', start: '2026-04-01T00:00:00Z', end: '2026-04-23T00:00:00Z' },
                    compare: { source: 'live', start: '2026-01-01T00:00:00Z', end: '2026-01-23T00:00:00Z' },
                },
                priority_risks: {
                    metric_type: 'stock',
                    current: { source: 'live', observed_at: '2026-04-23T00:00:00Z' },
                    compare: { source: 'stored', observed_at: '2026-01-20T12:00:00Z' },
                },
                active_vendors: {
                    metric_type: 'stock',
                    current: { source: 'stored', observed_at: '2026-04-11T09:30:00Z' },
                    compare: { source: 'missing', observed_at: null },
                },
            },
            snapshot_info: {
                current_quarter: '2026-Q2',
                last_quarter: '2026-Q1',
                last_quarter_snapshot_available: true,
                current_quarter_snapshot_available: true,
                missing_snapshot_quarters: [],
                snapshot_sources: { current: 'live', compare: 'stored' },
                missing_snapshot_metrics: { current: [], compare: ['active_vendors'] },
                period_metrics: ['new_risks'],
                snapshot_metrics: ['priority_risks', 'active_vendors'],
            },
        }));

        render(<QuarterlyComparisonWidget />);

        const priorityCard = await screen.findByRole('group', { name: 'quarterly.priority_risks' });
        expect(priorityCard).toHaveTextContent(`2026-Q2 · Live ${enDateTime('2026-04-23T00:00:00Z')}`);
        expect(priorityCard).toHaveTextContent(`2026-Q1 · Stored ${enDateTime('2026-01-20T12:00:00Z')}`);

        const vendorCard = screen.getByRole('group', { name: 'quarterly.active_vendors' });
        expect(vendorCard).toHaveTextContent(`2026-Q2 · Stored ${enDateTime('2026-04-11T09:30:00Z')}`);
        expect(within(vendorCard).getByText('2026-Q1 · Missing N/A')).toBeInTheDocument();
        expect(vendorCard).not.toHaveTextContent(enDateTime('2026-04-23T00:00:00Z'));
        expect(vendorCard.querySelector('time')).toHaveAttribute('datetime', '2026-04-11T09:30:00Z');
    });

    it('renders missing snapshot metadata as unavailable snapshot deltas', async () => {
        fetchQuarterlyComparisonMock.mockResolvedValue(comparisonPayload({
            this_quarter: { new_risks: 1 },
            last_quarter: { new_risks: 0 },
            changes: {
                new_risks: { absolute: 1, percentage: 100, direction: 'up' },
                priority_risks: {
                    absolute: 0,
                    percentage: 0,
                    direction: 'unknown',
                    note: 'Snapshot unavailable for selected period',
                },
            },
            snapshot_info: {
                current_quarter: '2026-Q2',
                last_quarter: '2026-Q1',
                last_quarter_snapshot_available: false,
                current_quarter_snapshot_available: false,
                missing_snapshot_quarters: ['2026-Q2', '2026-Q1'],
                snapshot_sources: { current: 'missing', compare: 'missing' },
                missing_snapshot_metrics: { current: ['priority_risks'], compare: ['priority_risks'] },
                period_metrics: ['new_risks'],
                snapshot_metrics: ['priority_risks'],
            },
        }));

        render(<QuarterlyComparisonWidget />);

        expect(await screen.findByText('missing 2026-Q2, 2026-Q1')).toBeInTheDocument();
        expect(screen.getByText('N/A')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('vs —')).toBeInTheDocument();
    });

    it('keeps the available snapshot side visible when only compare snapshot is missing', async () => {
        fetchQuarterlyComparisonMock.mockResolvedValue(comparisonPayload({
            this_quarter: { new_risks: 1, priority_risks: 4 },
            last_quarter: { new_risks: 0 },
            changes: {
                new_risks: { absolute: 1, percentage: 100, direction: 'up' },
                priority_risks: {
                    absolute: 0,
                    percentage: 0,
                    direction: 'unknown',
                    note: 'Snapshot unavailable for selected period',
                },
            },
            snapshot_info: {
                current_quarter: '2026-Q2',
                last_quarter: '2026-Q1',
                last_quarter_snapshot_available: false,
                current_quarter_snapshot_available: true,
                missing_snapshot_quarters: ['2026-Q1'],
                snapshot_sources: { current: 'live', compare: 'missing' },
                missing_snapshot_metrics: { current: [], compare: ['priority_risks'] },
                period_metrics: ['new_risks'],
                snapshot_metrics: ['priority_risks'],
            },
        }));

        render(<QuarterlyComparisonWidget />);

        expect(await screen.findByText('missing 2026-Q1')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getByText('vs —')).toBeInTheDocument();
        expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('marks only the missing metric side unavailable when a stored snapshot lacks a newer metric', async () => {
        fetchQuarterlyComparisonMock.mockResolvedValue(comparisonPayload({
            this_quarter: { new_risks: 1, active_vendors: 5 },
            last_quarter: { new_risks: 0 },
            changes: {
                new_risks: { absolute: 1, percentage: 100, direction: 'up' },
                active_vendors: {
                    absolute: 0,
                    percentage: 0,
                    direction: 'unknown',
                    note: 'Snapshot unavailable for selected period',
                },
            },
            snapshot_info: {
                current_quarter: '2026-Q2',
                last_quarter: '2026-Q1',
                last_quarter_snapshot_available: true,
                current_quarter_snapshot_available: true,
                missing_snapshot_quarters: [],
                snapshot_sources: { current: 'stored', compare: 'stored' },
                missing_snapshot_metrics: { current: [], compare: ['active_vendors'] },
                period_metrics: ['new_risks'],
                snapshot_metrics: ['active_vendors'],
            },
        }));

        render(<QuarterlyComparisonWidget />);

        expect(await screen.findByText('5')).toBeInTheDocument();
        expect(screen.getByText('vs —')).toBeInTheDocument();
        expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('uses a truthful generic hint when observations cannot be compared', async () => {
        fetchQuarterlyComparisonMock.mockResolvedValue(comparisonPayload({
            changes: {
                new_risks: { absolute: null, percentage: null, direction: 'unknown', reason: 'unequal_window' },
                priority_risks: { absolute: null, percentage: null, direction: 'unknown', reason: 'different_definition' },
            },
        }));

        render(<QuarterlyComparisonWidget />);

        // GAP-B-19: the reason is visible text, not only a `title` tooltip.
        expect(await screen.findAllByText('Comparison unavailable')).toHaveLength(2);
        expect(screen.queryByText('quarterly.no_snapshot_hint')).not.toBeInTheDocument();
        expect(document.querySelector('[title]')).toBeNull();
    });

    it('names a missing metric definition separately from a missing observation', () => {
        render(<QuarterMetricCard
            change={{
                absolute: null,
                percentage: null,
                direction: 'unknown',
                reason: 'missing_definition',
            }}
            compareSnapshotAvailable
            currentSnapshotAvailable
            isSnapshotMetric
            keyName="priority_risks"
            label="Priority Risks"
            lastValue={2}
            missingCompareSnapshotMetric={false}
            missingCurrentSnapshotMetric={false}
            t={(key) => key === 'quarterly.missing_definition'
                ? 'Metric definition unavailable'
                : key}
            thisValue={4}
        />);

        expect(screen.getByTestId('quarter-metric-hint-priority_risks')).toHaveTextContent('Metric definition unavailable');
    });
});
