import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { RiskQuestionnairesPanel } from '@/components/riskhub/RiskQuestionnairesPanel';
import { riskHubApi } from '@/services/riskHubApi';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options = [],
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options?: Array<{ value: string; label: string }>;
    }) => (
        <select value={value} onChange={(event) => onValueChange(event.target.value)}>
            <option value="">empty</option>
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: vi.fn().mockResolvedValue([]),
    },
}));

const mockGetRisks = vi.fn();
vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        toUiMessageKey: () => 'errors.failed',
    },
}));

vi.mock('@/services/riskHubApi', () => ({
    riskHubApi: {
        batchSendQuestionnaires: vi.fn(),
        getCapabilities: vi.fn(),
    },
}));

function renderWithQueryClient(ui: ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RiskQuestionnairesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({
            risk_types: { can_create: true },
            departments: { can_create: true },
            roles: { can_create: true },
            approval_scenarios: { can_update: true },
            system_settings: { can_update: true },
            questionnaires: { can_batch_send: true },
        });
        vi.mocked(riskHubApi.batchSendQuestionnaires).mockResolvedValue({
            created_count: 1,
            skipped_no_owner: [],
            skipped_open_exists: [],
            errors: [],
        });
        mockGetRisks.mockResolvedValue({
            items: [
                {
                    id: 1,
                    risk_id_code: 'R-1',
                    name: 'Owner named risk',
                    process: 'Process',
                    risk_type: 'operational',
                    category: 'Category',
                    description: 'desc',
                    gross_score: 9,
                    gross_probability: 3,
                    gross_impact: 3,
                    net_score: 4,
                    status: 'active',
                    is_priority: false,
                    department_id: 1,
                    department_name: 'Ops',
                    owner_id: 42,
                    owner_name: 'Test Owner',
                },
                {
                    id: 2,
                    risk_id_code: 'R-2',
                    name: 'Unknown owner risk',
                    process: 'Process',
                    risk_type: 'operational',
                    category: 'Category',
                    description: 'desc',
                    gross_score: 9,
                    gross_probability: 3,
                    gross_impact: 3,
                    net_score: 4,
                    status: 'active',
                    is_priority: false,
                    department_id: 1,
                    department_name: 'Ops',
                    owner_id: 77,
                    owner_name: null,
                },
            ],
            total: 2,
            offset: 0,
            limit: 50,
        });
    });

    it('renders owner names instead of raw owner ids', async () => {
        renderWithQueryClient(<RiskQuestionnairesPanel />);

        await waitFor(() => {
            expect(screen.getByText('Test Owner')).toBeInTheDocument();
        });
        expect(screen.getByText('common:fallbacks.unknown_user')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        expect(screen.queryByText('77')).not.toBeInTheDocument();
    });

    it('sends selected risk ids through the Risk Hub API when allowed', async () => {
        renderWithQueryClient(<RiskQuestionnairesPanel />);

        await screen.findByText('Owner named risk');
        const rowCheckboxes = screen.getAllByRole('checkbox');
        fireEvent.click(rowCheckboxes[2]);
        fireEvent.click(screen.getByRole('button', { name: 'riskhub.questionnaires.send' }));

        await waitFor(() => {
            expect(riskHubApi.batchSendQuestionnaires).toHaveBeenCalledWith({
                select_all: false,
                risk_ids: [1],
            });
        });
    });

    it('hides batch-send controls when backend capability is false', async () => {
        vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({
            risk_types: { can_create: true },
            departments: { can_create: true },
            roles: { can_create: true },
            approval_scenarios: { can_update: true },
            system_settings: { can_update: true },
            questionnaires: { can_batch_send: false },
        });

        renderWithQueryClient(<RiskQuestionnairesPanel />);

        await screen.findByText('Owner named risk');
        expect(screen.queryByRole('button', { name: 'riskhub.questionnaires.send' })).not.toBeInTheDocument();
        expect(screen.queryByText('riskhub.questionnaires.select_all')).not.toBeInTheDocument();
        expect(screen.queryByText('riskhub.questionnaires.selected_count')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });
});
