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

describe('protected Vendor approval scenario', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(riskHubApi.getApprovalScenarios).mockResolvedValue([{
            id: 87,
            key: 'protected_vendor_edit',
            display_name: 'Protected Vendor mutations',
            description: 'Approval for Critical and Significant Vendor changes',
            requires_approval: true,
            approver_roles: ['risk_manager'],
            fixed_policy: true,
            fixed_policy_definition: {
                threshold: 'current_or_proposed_tier_critical_or_significant',
                covered_actions: ['create', 'edit', 'link', 'archive'],
                allow_self_approval: false,
            },
            updated_at: '2026-07-30T05:00:00Z',
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

    it('shows immutable Vendor policy and only Risk Manager/CRO choices', async () => {
        renderPanel();

        await screen.findByText('Protected Vendor mutations');
        fireEvent.click(screen.getByRole('button', { name: 'admin:approval_scenarios.configure' }));

        expect(screen.getByTestId('protected-vendor-fixed-policy')).toBeInTheDocument();
        expect(screen.getByText(
            'admin:approval_scenarios.fixed_policy.triggers.current_or_proposed_tier_critical_or_significant',
        )).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /admin:approval_scenarios.modal.roles_selected/ }));
        expect(screen.getByRole('button', { name: 'Risk Manager' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CRO' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Department Head' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'CRO' }));
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));
        await waitFor(() => {
            expect(riskHubApi.updateApprovalScenario).toHaveBeenCalledWith('protected_vendor_edit', {
                requires_approval: true,
                approver_roles: ['risk_manager', 'cro'],
            });
        });
    });
});
