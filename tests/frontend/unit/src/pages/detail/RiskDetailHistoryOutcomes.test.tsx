import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { renderWithQueryClient as render } from '@test/render';

const getHistoryMock = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useParams: () => ({ id: '7' }) };
});

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: vi.fn().mockResolvedValue({
            id: 7,
            risk_id_code: 'RISK-007',
            name: 'Liquidity Risk',
            status: 'active',
            is_priority: false,
            process: 'Treasury',
            description: 'Liquidity mismatch.',
            capabilities: {},
            kris: [{ id: 9, metric_name: 'Liquidity buffer' }],
        }),
        getLinkedControls: vi.fn().mockResolvedValue([]),
        getLinkedVendors: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getOverdue: vi.fn().mockResolvedValue([]),
        getHistory: (...args: unknown[]) => getHistoryMock(...args),
    },
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskTypes: () => ({ getColor: () => '', getDisplayName: () => 'Operational' }),
}));
vi.mock('@/components/risks/RiskDetailOverviewTab', () => ({ RiskDetailOverviewTab: () => null }));
vi.mock('@/components/risks/RiskDetailQuestionnairesTab', () => ({ RiskDetailQuestionnairesTab: () => null }));
vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

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
};

describe('Risk detail aggregate KRI history outcomes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([403, 404])(
        'shows initial failure, retains stale history with Retry, and clears it on protected %i',
        async (status) => {
        getHistoryMock.mockRejectedValueOnce(new Error('history unavailable'));
        render(<MemoryRouter><RiskDetailPage /></MemoryRouter>);

        expect(await screen.findByRole('heading', { name: 'Liquidity Risk' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /History/ }));
        const initialFailure = await screen.findByTestId('risk-kri-history-load-state');
        expect(within(initialFailure).getByRole('button', { name: 'Retry' })).toBeInTheDocument();

        getHistoryMock.mockResolvedValueOnce(historyResponse);
        fireEvent.click(within(initialFailure).getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Liquidity buffer: 91 %')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Overview/ }));
        getHistoryMock.mockRejectedValueOnce(new Error('history refresh failed'));
        fireEvent.click(screen.getByRole('tab', { name: /History/ }));
        const stale = await screen.findByTestId('risk-kri-history-load-state');
        expect(screen.getByText('Liquidity buffer: 91 %')).toBeInTheDocument();
        expect(within(stale).getByRole('button', { name: 'Retry' })).toBeInTheDocument();

        getHistoryMock.mockRejectedValueOnce(new ApiClientError({
            status,
            messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
        }));
        fireEvent.click(within(stale).getByRole('button', { name: 'Retry' }));
        const denied = await screen.findByTestId('risk-kri-history-load-state');
        expect(screen.queryByText('Liquidity buffer: 91 %')).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        },
    );
});
