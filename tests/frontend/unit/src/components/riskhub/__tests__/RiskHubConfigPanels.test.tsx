import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalScenariosPanel } from '@/components/riskhub/ApprovalScenariosPanel';
import { DepartmentsPanel } from '@/components/riskhub/DepartmentsPanel';
import { RiskTypesPanel } from '@/components/riskhub/RiskTypesPanel';
import { riskHubApi } from '@/services/riskHubApi';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number; name?: string }) => {
            if (options?.name) return `${key}:${options.name}`;
            if (options?.count !== undefined) return `${key}:${options.count}`;
            return key;
        },
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
        <select aria-label="manager-select" value={value} onChange={(event) => onValueChange(event.target.value)}>
            <option value="">empty</option>
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

vi.mock('@/services/accessApi', () => ({
    accessApi: {
        listAccessUsers: vi.fn().mockResolvedValue([
            { id: 9, name: 'Dana Manager', email: 'dana@example.test' },
        ]),
    },
}));

vi.mock('@/services/riskHubApi', () => ({
    riskHubApi: {
        createDepartment: vi.fn(),
        createRiskType: vi.fn(),
        deleteDepartment: vi.fn(),
        deleteRiskType: vi.fn(),
        getApprovalScenarios: vi.fn(),
        getDepartments: vi.fn(),
        getRiskTypes: vi.fn(),
        getRoles: vi.fn(),
        restoreDepartment: vi.fn(),
        restoreRiskType: vi.fn(),
        updateApprovalScenario: vi.fn(),
        updateDepartment: vi.fn(),
        updateRiskType: vi.fn(),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        toUiMessageKey: () => 'errors.failed',
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

describe('Risk Hub config panels', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(riskHubApi.getRiskTypes).mockResolvedValue([
            {
                id: 1,
                code: 'operational',
                display_name: 'Operational',
                description: 'Operational risk',
                color: '#64748b',
                icon: null,
                sort_order: 1,
                is_active: true,
                is_system: false,
                risk_count: 0,
                created_at: '2026-04-01T00:00:00Z',
                updated_at: '2026-04-01T00:00:00Z',
            },
        ]);
        vi.mocked(riskHubApi.createRiskType).mockResolvedValue({} as never);
        vi.mocked(riskHubApi.getDepartments).mockResolvedValue([
            {
                id: 3,
                name: 'Operations',
                code: 'OPS',
                manager_id: null,
                manager_name: null,
                is_active: true,
                user_count: 0,
                risk_count: 0,
                control_count: 0,
                capabilities: { can_update: true, can_delete: true, can_restore: false },
            },
        ]);
        vi.mocked(riskHubApi.createDepartment).mockResolvedValue({} as never);
        vi.mocked(riskHubApi.getApprovalScenarios).mockResolvedValue([
            {
                id: 5,
                key: 'risk_update',
                display_name: 'Risk update',
                description: 'Approve risk updates',
                requires_approval: true,
                approver_roles: ['risk_owner'],
                updated_at: '2026-04-01T00:00:00Z',
                updated_by_name: null,
            },
        ]);
        vi.mocked(riskHubApi.getRoles).mockResolvedValue([
            {
                id: 2,
                name: 'cro',
                display_name: 'CRO',
                description: null,
                is_system: true,
                is_active: true,
                user_count: 1,
                permissions: [],
            },
        ]);
        vi.mocked(riskHubApi.updateApprovalScenario).mockResolvedValue({} as never);
    });

    it('creates risk types with normalized codes and entered display data', async () => {
        renderWithQueryClient(<RiskTypesPanel />);

        await screen.findByText('Operational');
        fireEvent.click(screen.getByRole('button', { name: 'admin:risk_types_panel.add_type' }));
        fireEvent.change(screen.getByPlaceholderText('admin:risk_types_panel.modal.placeholders.code'), {
            target: { value: 'New Type!' },
        });
        fireEvent.change(screen.getByPlaceholderText('admin:risk_types_panel.modal.placeholders.display_name'), {
            target: { value: 'New Type' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));

        await waitFor(() => {
            expect(riskHubApi.createRiskType).toHaveBeenCalledWith(expect.objectContaining({
                code: 'newtype',
                display_name: 'New Type',
            }));
        });
    });

    it('creates departments with manager selections', async () => {
        renderWithQueryClient(<DepartmentsPanel />);

        await screen.findByText('Operations');
        fireEvent.click(screen.getByRole('button', { name: 'admin:departments_panel.add_department' }));
        fireEvent.change(screen.getByPlaceholderText('admin:departments_panel.modal.placeholders.department_name'), {
            target: { value: 'Claims' },
        });
        fireEvent.change(screen.getByPlaceholderText('admin:departments_panel.modal.placeholders.code'), {
            target: { value: 'claims' },
        });
        await screen.findByText('Dana Manager (dana@example.test)');
        fireEvent.change(screen.getByLabelText('manager-select'), {
            target: { value: '9' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'admin:departments_panel.modal.save_department' }));

        await waitFor(() => {
            expect(riskHubApi.createDepartment).toHaveBeenCalledWith({
                code: 'CLAIMS',
                manager_id: 9,
                name: 'Claims',
            });
        });
    });

    it('updates approval scenario role configuration', async () => {
        renderWithQueryClient(<ApprovalScenariosPanel />);

        await screen.findByText('Risk update');
        fireEvent.click(screen.getByRole('button', { name: 'admin:approval_scenarios.configure' }));
        fireEvent.click(screen.getByRole('button', { name: /admin:approval_scenarios.modal.roles_selected/ }));
        fireEvent.click(screen.getByRole('button', { name: 'CRO' }));
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));

        await waitFor(() => {
            expect(riskHubApi.updateApprovalScenario).toHaveBeenCalledWith('risk_update', {
                approver_roles: ['risk_owner', 'cro'],
                requires_approval: true,
            });
        });
    });
});
