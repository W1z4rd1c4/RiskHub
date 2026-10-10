import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalScenariosPanel } from '@/components/riskhub/ApprovalScenariosPanel';
import { DepartmentsPanel } from '@/components/riskhub/DepartmentsPanel';
import { RiskTypesPanel } from '@/components/riskhub/RiskTypesPanel';
import { accessApi } from '@/services/accessApi';
import { riskHubApi } from '@/services/riskHubApi';

vi.mock('@/i18n/hooks', async (importOriginal) => ({
    // `translateUiMessage` stays real; only `useTranslation` is stubbed.
    ...(await importOriginal<typeof import('@/i18n/hooks')>()),
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
            { id: 9, name: 'Dana Manager', email: 'dana@example.test', department_id: 3, is_active: true },
            { id: 10, name: 'Inactive Manager', email: 'inactive@example.test', department_id: 3, is_active: false },
            { id: 11, name: 'Other Manager', email: 'other@example.test', department_id: 4, is_active: true },
        ]),
    },
}));

vi.mock('@/services/riskHubApi', () => ({
    APPROVAL_SCENARIO_APPROVER_ROLES: ['risk_owner', 'risk_manager', 'cro'],
    riskHubApi: {
        createDepartment: vi.fn(),
        createRiskType: vi.fn(),
        deleteDepartment: vi.fn(),
        deleteRiskType: vi.fn(),
        getApprovalScenarios: vi.fn(),
        getCapabilities: vi.fn(),
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
                capabilities: {
                    can_create: true,
                    can_update: true,
                    can_delete: true,
                    can_restore: false,
                },
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
                kri_count: 0,
                vendor_count: 0,
                pending_orphan_count: 0,
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
                capabilities: { can_update: true },
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
        vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({
            risk_types: { can_create: true },
            departments: { can_create: true },
            roles: { can_create: true },
            approval_scenarios: { can_update: true },
            system_settings: { can_update: true },
            questionnaires: { can_batch_send: true },
        });
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

    it('renders a department load failure as an error with retry, never as an empty list (GAP-C-11)', async () => {
        const departments = await riskHubApi.getDepartments(false);
        vi.mocked(riskHubApi.getDepartments)
            .mockReset()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce(departments);
        renderWithQueryClient(<DepartmentsPanel />);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('errors.load_failed');
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.queryByText('admin:departments_panel.title')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));
        expect(await screen.findByText('Operations')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(riskHubApi.getDepartments).toHaveBeenCalledTimes(2);
    });

    it.each([
        {
            name: 'risk types',
            panel: () => <RiskTypesPanel />,
            load: () => vi.mocked(riskHubApi.getRiskTypes),
            message: 'errors.failed_to_load_risk_types',
            loaded: 'Operational',
        },
        {
            name: 'approval scenarios',
            panel: () => <ApprovalScenariosPanel />,
            load: () => vi.mocked(riskHubApi.getApprovalScenarios),
            message: 'admin:errors.failed_to_load_approval_scenarios',
            loaded: 'Risk update',
        },
    ])('renders a $name load failure as an error with retry (DS-17, GAP-C-11)', async ({ panel, load, message, loaded }) => {
        const loader = load() as unknown as ReturnType<typeof vi.fn>;
        const items = await loader();
        loader.mockReset().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(items);
        renderWithQueryClient(panel());

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(message);

        fireEvent.click(within(alert).getByRole('button', { name: 'actions.retry' }));
        expect(await screen.findByText(loaded)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('creates departments without manager assignment', async () => {
        renderWithQueryClient(<DepartmentsPanel />);

        await screen.findByText('Operations');
        fireEvent.click(screen.getByRole('button', { name: 'admin:departments_panel.add_department' }));
        fireEvent.change(screen.getByPlaceholderText('admin:departments_panel.modal.placeholders.department_name'), {
            target: { value: 'Claims' },
        });
        fireEvent.change(screen.getByPlaceholderText('admin:departments_panel.modal.placeholders.code'), {
            target: { value: 'claims' },
        });
        expect(screen.queryByLabelText('manager-select')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'admin:departments_panel.modal.save_department' }));

        await waitFor(() => {
            expect(riskHubApi.createDepartment).toHaveBeenCalledWith({
                code: 'CLAIMS',
                name: 'Claims',
            });
        });
    });

    it('keeps manager assignment available when editing departments', async () => {
        renderWithQueryClient(<DepartmentsPanel />);

        await screen.findByText('Operations');
        // PM (W8): the row edit names its row.
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.edit_named:Operations' }));
        await screen.findByText('Dana Manager (dana@example.test)');
        expect(accessApi.listAccessUsers).toHaveBeenCalledWith({ department_id: 3 });
        expect(screen.queryByText('Inactive Manager (inactive@example.test)')).not.toBeInTheDocument();
        expect(screen.queryByText('Other Manager (other@example.test)')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('manager-select'), {
            target: { value: '9' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'admin:departments_panel.modal.save_department' }));

        await waitFor(() => {
            expect(riskHubApi.updateDepartment).toHaveBeenCalledWith(3, {
                code: 'OPS',
                manager_id: 9,
                name: 'Operations',
            });
        });
    });

    it('updates approval scenario role configuration', async () => {
        renderWithQueryClient(<ApprovalScenariosPanel />);

        await screen.findByText('Risk update');
        // GAP-D-06: approver badges read translated role names, never the raw code.
        expect(screen.getByText('admin:approval_scenarios.special_roles.risk_owner')).toBeInTheDocument();
        expect(screen.queryByText('risk_owner')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'admin:approval_scenarios.modal.configure:Risk update' }));
        // GAP-B-07: the approver picker is a named MultiSelect (combobox + checkbox list).
        const rolePicker = screen.getByRole('combobox', { name: 'admin:approval_scenarios.approver_roles' });
        expect(rolePicker).toHaveTextContent('admin:approval_scenarios.modal.roles_selected:1');
        fireEvent.click(rolePicker);
        fireEvent.click(await screen.findByRole('checkbox', { name: 'common:roles.cro' }));
        expect(rolePicker).toHaveTextContent('admin:approval_scenarios.modal.roles_selected:2');
        // Chip removal is worded "Remove", not "Delete".
        expect(screen.getByRole('button', { name: 'actions.remove_named:common:roles.cro' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));

        await waitFor(() => {
            expect(riskHubApi.updateApprovalScenario).toHaveBeenCalledWith('risk_update', {
                approver_roles: ['risk_owner', 'cro'],
                requires_approval: true,
            });
        });
    });

    it('only offers backend-supported approver roles in approval scenarios', async () => {
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
            {
                id: 3,
                name: 'department_head',
                display_name: 'Department Head',
                description: null,
                is_system: true,
                is_active: true,
                user_count: 1,
                permissions: [],
            },
        ]);

        renderWithQueryClient(<ApprovalScenariosPanel />);

        await screen.findByText('Risk update');
        fireEvent.click(screen.getByRole('button', { name: 'admin:approval_scenarios.modal.configure:Risk update' }));
        fireEvent.click(screen.getByRole('combobox', { name: 'admin:approval_scenarios.approver_roles' }));

        expect(await screen.findByRole('checkbox', { name: 'common:roles.cro' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'common:roles.department_head' })).not.toBeInTheDocument();
    });

    it('keeps risk type archive confirmation open and shows an error when archive fails', async () => {
        vi.mocked(riskHubApi.deleteRiskType).mockRejectedValue(new Error('delete failed'));

        renderWithQueryClient(<RiskTypesPanel />);

        await screen.findByText('Operational');
        // D10: soft-deleted, restorable risk types are archived (Archive icon, never Trash2).
        const rowAction = screen.getByRole('button', { name: 'common:actions.archive_named:Operational' });
        expect(rowAction.querySelector('svg.lucide-archive')).not.toBeNull();
        fireEvent.click(rowAction);
        // PM-1: the archive goes through ConfirmDialog intent="archive" (no reason: the API takes none).
        const modal = await screen.findByRole('alertdialog', { name: 'confirmations.archive_risk_type' });
        expect(within(modal).queryByRole('textbox')).not.toBeInTheDocument();
        expect(within(modal).getByText('admin:risk_types_panel.archive_confirm:Operational')).toBeInTheDocument();

        fireEvent.click(within(modal).getByRole('button', { name: 'actions.archive' }));

        await waitFor(() => {
            expect(within(modal).getByRole('alert')).toHaveTextContent('errors.failed');
        });
        expect(within(modal).getByText('confirmations.archive_risk_type')).toBeInTheDocument();
    });

    it('keeps the department archive error inside the open confirmation', async () => {
        vi.mocked(riskHubApi.deleteDepartment).mockRejectedValue(new Error('delete failed'));

        renderWithQueryClient(<DepartmentsPanel />);

        const rowAction = await screen.findByRole('button', { name: /^common:actions\.archive_named:/ });
        expect(rowAction.querySelector('svg.lucide-trash-2')).toBeNull();
        fireEvent.click(rowAction);
        const modal = await screen.findByRole('alertdialog', { name: 'confirmations.archive_department' });

        fireEvent.click(within(modal).getByRole('button', { name: 'actions.archive' }));

        await waitFor(() => {
            expect(within(modal).getByRole('alert')).toHaveTextContent('errors.failed');
        });
        expect(screen.getByRole('alertdialog', { name: 'confirmations.archive_department' })).toBeInTheDocument();
    });

    it('keeps approval scenario modal open and shows an error when save fails', async () => {
        vi.mocked(riskHubApi.updateApprovalScenario).mockRejectedValue(new Error('save failed'));

        renderWithQueryClient(<ApprovalScenariosPanel />);

        await screen.findByText('Risk update');
        fireEvent.click(screen.getByRole('button', { name: 'admin:approval_scenarios.modal.configure:Risk update' }));
        await screen.findByText('admin:approval_scenarios.modal.configure:Risk update');
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));

        await screen.findByText('errors.failed');
        expect(screen.getByText('admin:approval_scenarios.modal.configure:Risk update')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'common:actions.save' })).toBeEnabled();
    });

    it('hides collection actions when backend capabilities are absent or false', async () => {
        vi.mocked(riskHubApi.getCapabilities).mockResolvedValue({
            risk_types: { can_create: false },
            departments: { can_create: false },
            roles: { can_create: false },
            approval_scenarios: { can_update: false },
            system_settings: { can_update: false },
            questionnaires: { can_batch_send: false },
        });

        renderWithQueryClient(<RiskTypesPanel />);
        await screen.findByText('Operational');
        expect(screen.queryByRole('button', { name: 'admin:risk_types_panel.add_type' })).not.toBeInTheDocument();
    });

    it('keeps an edit the user cannot make visible with its reason (GAP-B-03)', async () => {
        const [riskType] = await riskHubApi.getRiskTypes(false);
        vi.mocked(riskHubApi.getRiskTypes).mockResolvedValue([
            { ...riskType, capabilities: { can_create: true, can_update: false, can_delete: false, can_restore: false } },
        ]);
        renderWithQueryClient(<RiskTypesPanel />);

        await screen.findByText('Operational');
        const edit = screen.getByRole('button', { name: 'common:actions.edit_named:Operational' });
        expect(edit).toHaveAttribute('aria-disabled', 'true');
        expect(edit).toHaveAccessibleDescription('admin:risk_types_panel.actions.edit_disabled:Operational');
        fireEvent.click(edit);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('warns in the archive confirmation how many risks lose their type', async () => {
        const [riskType] = await riskHubApi.getRiskTypes(false);
        vi.mocked(riskHubApi.getRiskTypes).mockResolvedValue([{ ...riskType, risk_count: 3 }]);
        renderWithQueryClient(<RiskTypesPanel />);

        await screen.findByText('Operational');
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.archive_named:Operational' }));
        const modal = await screen.findByRole('alertdialog', { name: 'confirmations.archive_risk_type' });
        expect(modal).toHaveTextContent('admin:risk_types_panel.delete_warning:3');
    });

    it('explains a blocked department archive on the row action instead of opening a dead-end dialog', async () => {
        const [department] = await riskHubApi.getDepartments(false);
        vi.mocked(riskHubApi.getDepartments).mockResolvedValue([{ ...department, risk_count: 2, kri_count: 1 }]);
        renderWithQueryClient(<DepartmentsPanel />);

        await screen.findByText('Operations');
        const archive = screen.getByRole('button', { name: 'common:actions.archive_named:Operations' });
        expect(archive).toHaveAttribute('aria-disabled', 'true');
        expect(archive).toHaveAccessibleDescription('admin:departments_panel.archive_blocked_reason');
        fireEvent.click(archive);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(riskHubApi.deleteDepartment).not.toHaveBeenCalled();
    });

    it('renders an empty list through the shared EmptyState, not an empty table (DS-17)', async () => {
        vi.mocked(riskHubApi.getRiskTypes).mockResolvedValue([]);
        renderWithQueryClient(<RiskTypesPanel />);

        expect(await screen.findByTestId('risk-types-empty')).toHaveTextContent('admin:risk_types_panel.empty');
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('names the show-archived filter and reloads with archived rows (AX-04)', async () => {
        renderWithQueryClient(<DepartmentsPanel />);

        await screen.findByText('Operations');
        fireEvent.click(screen.getByRole('checkbox', { name: 'admin:departments_panel.show_deleted' }));
        await waitFor(() => expect(riskHubApi.getDepartments).toHaveBeenLastCalledWith(true));
    });

    it('routes config panel mutation workflow through the shared resource hook', () => {
        const files = [
            'src/components/riskhub/RiskTypesPanel.tsx',
            'src/components/riskhub/DepartmentsPanel.tsx',
            'src/components/riskhub/ApprovalScenariosPanel.tsx',
            'src/components/riskhub/roles/useRolesPanelData.ts',
        ];

        for (const file of files) {
            const source = readFileSync(resolve(process.cwd(), file), 'utf8');
            expect(source).toContain('useRiskHubConfigResource');
        }
    });
});
