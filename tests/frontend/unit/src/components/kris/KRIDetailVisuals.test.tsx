import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KRIDetailHistoryTab } from '@/components/kris/KRIDetailHistoryTab';
import { KRIDetailOverviewTab } from '@/components/kris/KRIDetailOverviewTab';

const trendChartMock = vi.fn();
const gaugeMock = vi.fn();
const timelineMock = vi.fn();

vi.mock('@/components/history', () => ({
    HistoryTimeline: (props: { onItemAction?: (item: unknown) => void; actionLabel?: string }) => {
        timelineMock(props);
        return (
            <div>
                timeline
                {props.onItemAction && <button type="button">{props.actionLabel}</button>}
            </div>
        );
    },
    HistoryComparisonPanel: () => <div>comparison</div>,
    HistoryTrendChart: (props: unknown) => {
        trendChartMock(props);
        return <div>trend chart</div>;
    },
}));

vi.mock('@/components/ui/MetricGaugeSvg', () => ({
    MetricGaugeSvg: (props: unknown) => {
        gaugeMock(props);
        return <div>gauge</div>;
    },
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string | { ns?: string }) => typeof fallback === 'string' ? fallback : key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', () => ({
    formatDateValue: (value: string) => value,
    formatMetricNumberValue: (value: number) => String(value),
}));

vi.mock('@/lib/monitoringStatus', () => ({
    getKriMonitoringMeta: () => ({
        gaugeClassName: 'bg-emerald-500',
        textClassName: 'text-emerald-500',
    }),
}));

describe('KRI detail visuals', () => {
    it('preserves below-limit history statuses in trend data', () => {
        render(
            <KRIDetailHistoryTab
                history={[
                    {
                        id: 1,
                        kri_id: 10,
                        period_start: '2026-01-01',
                        period_end: '2026-01-31',
                        recorded_at: '2026-02-01T00:00:00Z',
                        value: 4,
                        lower_limit: 5,
                        upper_limit: 10,
                        unit: '%',
                        breach_status: 'below',
                    },
                ]}
                historyTotal={1}
                isLoadingHistory={false}
                lowerLimit={5}
                upperLimit={10}
                unit="%"
                onSelectEntry={vi.fn()}
                canRequestCorrection
            />
        );

        expect(screen.getByText('trend chart')).toBeInTheDocument();
        expect(trendChartMock).toHaveBeenCalledWith(expect.objectContaining({
            data: [expect.objectContaining({ status: 'below' })],
        }));
    });

    it('uses history capabilities to hide or show correction actions', () => {
        const baseProps = {
            history: [
                {
                    id: 1,
                    kri_id: 10,
                    period_start: '2026-01-01',
                    period_end: '2026-01-31',
                    recorded_at: '2026-02-01T00:00:00Z',
                    value: 4,
                    lower_limit: 5,
                    upper_limit: 10,
                    unit: '%',
                    breach_status: 'below' as const,
                },
            ],
            historyTotal: 1,
            isLoadingHistory: false,
            lowerLimit: 5,
            upperLimit: 10,
            unit: '%',
            onSelectEntry: vi.fn(),
        };

        const { rerender } = render(<KRIDetailHistoryTab {...baseProps} canRequestCorrection={false} />);

        expect(screen.queryByRole('button', { name: 'history_edit.request_correction' })).not.toBeInTheDocument();
        expect(timelineMock).toHaveBeenLastCalledWith(expect.objectContaining({ onItemAction: undefined }));

        rerender(<KRIDetailHistoryTab {...baseProps} canRequestCorrection />);

        expect(screen.getByRole('button', { name: 'history_edit.request_correction' })).toBeInTheDocument();
        expect(timelineMock).toHaveBeenLastCalledWith(expect.objectContaining({
            onItemAction: expect.any(Function),
        }));
    });

    it('normalizes the overview gauge across the lower and upper bounds', () => {
        render(
            <KRIDetailOverviewTab
                kri={{
                    id: 1,
                    risk_id: 2,
                    metric_name: 'Loss Ratio',
                    description: 'desc',
                    current_value: 15,
                    lower_limit: 10,
                    upper_limit: 20,
                    unit: '%',
                    breach_status: 'within',
                    last_updated: '2026-04-19T00:00:00Z',
                    created_at: '2026-04-19T00:00:00Z',
                    frequency: 'monthly',
                    monitoring_status: 'optimal',
                }}
                linkedRisk={null}
                dueDate={null}
                formatNumber={(value) => String(value)}
                onNavigateToRisk={vi.fn()}
            />
        );

        expect(screen.getByText('gauge')).toBeInTheDocument();
        expect(gaugeMock).toHaveBeenCalledWith(expect.objectContaining({
            valuePct: 50,
            zones: [expect.objectContaining({ startPct: 0, endPct: 100 })],
        }));
    });
});
