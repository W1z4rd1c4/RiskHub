import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { renderWithQueryClient as render } from '@test/render';

const getHistoryMock = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useParams: () => ({ id: '9' }) };
});

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRI: vi.fn().mockResolvedValue({
            id: 9,
            risk_id: null,
            metric_name: 'Liquidity buffer',
            current_value: 90,
            lower_limit: 80,
            upper_limit: 100,
            unit: '%',
            breach_status: 'within',
            is_archived: false,
            capabilities: { can_request_history_correction: true },
        }),
        getHistory: (...args: unknown[]) => getHistoryMock(...args),
    },
}));
vi.mock('@/services/riskApi', () => ({ riskApi: { getRisk: vi.fn() } }));
vi.mock('@/components/kris/KRIDetailOverviewTab', () => ({ KRIDetailOverviewTab: () => null }));
vi.mock('@/components/history', () => ({
    HistoryTrendChart: () => null,
    HistoryComparisonPanel: () => null,
    HistoryTimeline: ({
        items,
        onItemAction,
        actionLabel,
    }: {
        items: Array<{ id: number; title: string }>;
        onItemAction?: (item: { id: number; title: string }) => void;
        actionLabel?: string;
    }) => (
        <div>
            {items.map((item) => (
                <div key={item.id}>
                    <span>{item.title}</span>
                    {onItemAction ? (
                        <button type="button" onClick={() => onItemAction(item)}>{actionLabel}</button>
                    ) : null}
                </div>
            ))}
        </div>
    ),
}));
vi.mock('@/components/kri/KRIModal', () => ({ KRIModal: () => null }));
vi.mock('@/components/kri/KRIValueModal', () => ({ KRIValueModal: () => null }));
vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/issues/IssueQuickCreateModal', () => ({ IssueQuickCreateModal: () => null }));
vi.mock('@/components/kri/KRIHistoryEditModal', () => ({
    KRIHistoryEditModal: ({ onError }: { onError: () => void }) => (
        <button type="button" onClick={onError}>correction-failed</button>
    ),
}));

const historyResponse = {
    items: [{
        id: 3,
        kri_id: 9,
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        recorded_at: '2026-09-01T10:00:00Z',
        value: 91,
        lower_limit: 80,
        upper_limit: 100,
        unit: '%',
        breach_status: 'within',
        recorded_by_id: null,
        recorded_by_name: null,
    }],
    total: 1,
    capabilities: { can_request_correction: true },
};

describe('KRI detail history outcomes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([403, 404])(
        'shows initial failure, retains stale history with Retry, and clears it on protected %i',
        async (status) => {
        getHistoryMock.mockRejectedValueOnce(new Error('history unavailable'));
        render(<MemoryRouter><KRIDetailPage /></MemoryRouter>);

        expect(await screen.findByRole('heading', { name: 'Liquidity buffer' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /History/ }));
        const initialFailure = await screen.findByTestId('kri-history-load-state');
        expect(within(initialFailure).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        const initialSignal = getHistoryMock.mock.calls[0]?.[2]?.signal as AbortSignal;
        expect(initialSignal).toBeInstanceOf(AbortSignal);

        getHistoryMock.mockResolvedValueOnce(historyResponse);
        fireEvent.click(within(initialFailure).getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('91 %')).toBeInTheDocument();
        const retrySignal = getHistoryMock.mock.calls[1]?.[2]?.signal as AbortSignal;
        expect(retrySignal).toBeInstanceOf(AbortSignal);

        getHistoryMock.mockRejectedValueOnce(new Error('history refresh failed'));
        fireEvent.click(screen.getByRole('button', { name: 'Request Correction' }));
        fireEvent.click(screen.getByRole('button', { name: 'correction-failed' }));
        const stale = await screen.findByTestId('kri-history-load-state');
        expect(screen.getByText('91 %')).toBeInTheDocument();
        const correctionSignal = getHistoryMock.mock.calls[2]?.[2]?.signal as AbortSignal;
        expect(correctionSignal).toBeInstanceOf(AbortSignal);

        getHistoryMock.mockRejectedValueOnce(new ApiClientError({
            status,
            messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
        }));
        fireEvent.click(within(stale).getByRole('button', { name: 'Retry' }));
        const denied = await screen.findByTestId('kri-history-load-state');
        expect(screen.queryByText('91 %')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'correction-failed' })).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        },
    );

    it('aborts its owned history request when the detail route unmounts', async () => {
        const pending = new Promise<typeof historyResponse>(() => undefined);
        getHistoryMock.mockReturnValueOnce(pending);
        const view = render(<MemoryRouter><KRIDetailPage /></MemoryRouter>);
        expect(await screen.findByRole('heading', { name: 'Liquidity buffer' })).toBeInTheDocument();
        const signal = getHistoryMock.mock.calls[0]?.[2]?.signal as AbortSignal;
        expect(signal).toBeInstanceOf(AbortSignal);

        view.unmount();

        expect(signal.aborted).toBe(true);
    });
});
