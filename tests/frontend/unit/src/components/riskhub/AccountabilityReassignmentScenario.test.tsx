import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number; name?: string }) => {
            if (options?.name) return `${key}:${options.name}`;
            if (options?.count !== undefined) return `${key}:${options.count}`;
            return key;
        },
    }),
}));

vi.mock('@/services/riskHubApi', () => ({
    APPROVAL_SCENARIO_APPROVER_ROLES: ['risk_owner', 'risk_manager', 'cro'],
    riskHubApi: {
        getApprovalScenarios: vi.fn(),
        getCapabilities: vi.fn(),
        getRoles: vi.fn(),
        updateApprovalScenario: vi.fn(),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: { toUiMessageKey: () => 'errors.failed' },
}));

import { ApprovalScenariosPanel } from '@/components/riskhub/ApprovalScenariosPanel';
import { riskHubApi } from '@/services/riskHubApi';

function renderPanel() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <ApprovalScenariosPanel />
        </QueryClientProvider>,
    );
}

describe('accountability reassignment approval scenario', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(riskHubApi.getApprovalScenarios).mockResolvedValue([{
            id: 88,
            key: 'accountability_reassignment',
            display_name: 'Accountability reassignments',
            description: 'Approval for accountable user and Owning Department changes',
            requires_approval: true,
            approver_roles: ['risk_manager'],
            fixed_policy: true,
            fixed_policy_definition: {
                threshold: 'accountable_user_or_owning_department_change',
                covered_actions: ['edit'],
                allow_self_approval: false,
            },
            updated_at: '2026-07-30T08:00:00Z',
            updated_by_name: null,
            capabilities: { can_update: true },
        }]);
        vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({
            risk_types: {},
            departments: {},
            roles: {},
            approval_scenarios: { can_update: true },
            system_settings: {},
            questionnaires: {},
        });
        vi.mocked(riskHubApi.getRoles).mockResolvedValue([
            { id: 1, name: 'risk_manager', display_name: 'Risk Manager', description: null, is_system: true, is_active: true, user_count: 1, permissions: [] },
            { id: 2, name: 'cro', display_name: 'CRO', description: null, is_system: true, is_active: true, user_count: 1, permissions: [] },
            { id: 3, name: 'department_head', display_name: 'Department Head', description: null, is_system: true, is_active: true, user_count: 1, permissions: [] },
        ]);
        vi.mocked(riskHubApi.updateApprovalScenario).mockResolvedValue({} as never);
    });

    it('presents the default-on immutable policy and only permits Risk Manager/CRO configuration', async () => {
        renderPanel();

        await screen.findByText('Accountability reassignments');
        expect(screen.getByText('admin:approval_scenarios.enabled')).toBeInTheDocument();
        expect(screen.getByText(
            /admin:approval_scenarios\.fixed_policy\.triggers\.accountable_user_or_owning_department_change/,
        )).toHaveTextContent('admin:approval_scenarios.fixed_policy.covered_action_values.edit');
        expect(screen.getByText(
            /admin:approval_scenarios\.fixed_policy\.triggers\.accountable_user_or_owning_department_change/,
        )).toHaveTextContent('admin:approval_scenarios.fixed_policy.self_approval.false');

        fireEvent.click(screen.getByRole('button', { name: 'admin:approval_scenarios.configure' }));
        expect(screen.getByTestId('accountability-reassignment-fixed-policy')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'admin:approval_scenarios.requires_approval' })).toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: /admin:approval_scenarios.modal.roles_selected/ }));
        expect(screen.getByRole('button', { name: 'Risk Manager' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CRO' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Department Head' })).not.toBeInTheDocument();
        expect(screen.queryByText('admin:approval_scenarios.special_roles.risk_owner_dynamic')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Risk Manager' }));
        expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'CRO' }));
        expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));

        await waitFor(() => {
            expect(riskHubApi.updateApprovalScenario).toHaveBeenCalledWith('accountability_reassignment', {
                requires_approval: true,
                approver_roles: ['cro'],
            });
        });
    });
});
