import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlDetailPage } from '@/pages/ControlDetailPage';

const mockNavigate = vi.fn();
const mockGetControl = vi.fn();
const mockGetLinkedRisks = vi.fn();
let historyRenderCount = 0;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '13' }),
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        isLoading: false,
        user: { id: 2 },
        hasPermission: () => true,
    }),
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControl: (...args: unknown[]) => mockGetControl(...args),
        getLinkedRisks: (...args: unknown[]) => mockGetLinkedRisks(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: vi.fn(),
    },
}));

vi.mock('@/components/executions/ExecutionHistory', () => ({
    ExecutionHistory: () => {
        historyRenderCount += 1;
        return <div data-testid="execution-history-renders">history-renders:{historyRenderCount}</div>;
    },
}));

vi.mock('@/components/executions/ExecutionLogModal', () => ({
    ExecutionLogModal: ({
        isOpen,
        onSuccess,
    }: {
        isOpen: boolean;
        onSuccess?: () => void;
    }) => (
        isOpen ? (
            <button type="button" onClick={() => onSuccess?.()}>
                trigger-success
            </button>
        ) : null
    ),
}));

vi.mock('@/components/ArchiveConfirmDialog', () => ({
    ArchiveConfirmDialog: () => null,
}));

vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: () => null,
}));

describe('ControlDetailPage execution status refresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        historyRenderCount = 0;
        mockGetControl
            .mockResolvedValueOnce({
                id: 13,
                name: 'Quarterly Access Review',
                description: 'Ensure privileged access is reviewed.',
                status: 'active',
                risk_level: 3,
                frequency: 'monthly',
                control_form: 'manual',
                control_owner_id: 2,
                monitoring_status: 'failed',
            })
            .mockResolvedValueOnce({
                id: 13,
                name: 'Quarterly Access Review',
                description: 'Ensure privileged access is reviewed.',
                status: 'active',
                risk_level: 3,
                frequency: 'monthly',
                control_form: 'manual',
                control_owner_id: 2,
                monitoring_status: 'passed',
            });
        mockGetLinkedRisks.mockResolvedValue([]);
    });

    it('refetches control detail and refreshes history after execution logging succeeds', async () => {
        render(<ControlDetailPage />);

        await screen.findByText('Quarterly Access Review');
        expect(screen.getByText('controls:monitoring.failed')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /controls:detail.execution_history/i }));
        await screen.findByTestId('execution-history-renders');
        expect(screen.getByText(/^history-renders:/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /controls:execution.log_execution/i }));
        fireEvent.click(screen.getByRole('button', { name: 'trigger-success' }));

        await waitFor(() => {
            expect(mockGetControl).toHaveBeenCalledTimes(2);
        });

        await waitFor(() => {
            expect(screen.getByText('controls:monitoring.passed')).toBeInTheDocument();
        });
        expect(screen.queryByText('controls:monitoring.failed')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(historyRenderCount).toBeGreaterThan(1);
        });
    });
});
