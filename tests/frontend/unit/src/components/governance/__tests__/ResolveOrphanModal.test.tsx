import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as axe from 'axe-core';

import { ResolveOrphanModal } from '@/components/governance/ResolveOrphanModal';
import { approvalCreatedResponseSchema } from '@/services/api/schemas';
import { ApiClientError } from '@/services/apiClient';
import type { OrphanedItem } from '@/types/orphanedItem';

const mockGetLinkedRisks = vi.fn();
const mockGetDepartments = vi.fn();
const mockResolveOrphan = vi.fn();
const mockGetRisks = vi.fn();
const mockListUsers = vi.fn();
const mockGetProcessOwners = vi.fn();
const mockGetProcessDepartments = vi.fn();
const mockGetAssetOwners = vi.fn();
const mockGetAssetDepartments = vi.fn();
const mockGetVendorOwners = vi.fn();
const mockGetThreatStewards = vi.fn();
const mockLogError = vi.fn();

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getLinkedRisks: (...args: unknown[]) => mockGetLinkedRisks(...args),
    },
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: (...args: unknown[]) => mockGetDepartments(...args),
    },
}));

vi.mock('@/services/orphanedItemsApi', () => ({
    orphanedItemsApi: {
        resolveOrphan: (...args: unknown[]) => mockResolveOrphan(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        listUsers: (...args: unknown[]) => mockListUsers(...args),
    },
}));

vi.mock('@/services/logger', () => ({
    logError: (...args: unknown[]) => mockLogError(...args),
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getProcessOwners: (...args: unknown[]) => mockGetProcessOwners(...args),
        getProcessDepartments: (...args: unknown[]) => mockGetProcessDepartments(...args),
        getAssetOwners: (...args: unknown[]) => mockGetAssetOwners(...args),
        getAssetDepartments: (...args: unknown[]) => mockGetAssetDepartments(...args),
        getVendorOwners: (...args: unknown[]) => mockGetVendorOwners(...args),
        getThreatStewards: (...args: unknown[]) => mockGetThreatStewards(...args),
    },
}));

function orphan(overrides: Partial<OrphanedItem> = {}): OrphanedItem {
    return {
        id: 901,
        item_type: 'risk',
        item_id: 44,
        item_name: 'Risk A',
        item_description: null,
        item_identifier: 'R-1',
        department_name: 'Operations',
        previous_owner_name: 'Previous Owner',
        previous_owner_email: 'previous@example.com',
        orphaned_at: '2026-03-10T10:00:00Z',
        status: 'pending',
        request_reason_required: false,
        capabilities: {
            can_resolve: true,
            can_view_detail: true,
            requires_department: false,
            requires_owner: true,
            requires_risk: false,
        },
        ...overrides,
    };
}

async function openModal(item: OrphanedItem, overrides: Partial<Parameters<typeof ResolveOrphanModal>[0]> = {}) {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        onResolved: vi.fn(),
        orphan: item,
        ...overrides,
    };
    const { container } = render(<ResolveOrphanModal {...props} />);
    await screen.findByText(item.item_name);
    return { ...props, container };
}

describe('ResolveOrphanModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListUsers.mockResolvedValue([
            {
                id: 7,
                name: 'Ops Owner',
                email: 'ops@example.com',
                is_active: true,
                department_id: 3,
                department_name: 'Operations',
                employee_type: 'head',
            },
            {
                id: 8,
                name: 'Inactive User',
                email: 'inactive@example.com',
                is_active: false,
                department_id: 3,
                department_name: 'Operations',
            },
        ]);
        mockGetDepartments.mockResolvedValue([
            {
                id: 3,
                name: 'Operations',
                code: 'OPS',
                user_count: 1,
                risk_count: 0,
                control_count: 0,
                kri_count: 0,
                high_risk_count: 0,
                breaching_kri_count: 0,
                total_net_score: 0,
            },
            {
                id: 4,
                name: 'Finance',
                code: 'FIN',
                user_count: 1,
                risk_count: 0,
                control_count: 0,
                kri_count: 0,
                high_risk_count: 0,
                breaching_kri_count: 0,
                total_net_score: 0,
            },
        ]);
        mockGetProcessOwners.mockResolvedValue([
            {
                id: 7,
                name: 'Ops Owner',
                email: 'ops@example.com',
                department_id: 3,
                department_name: 'Operations',
                role_name: 'Risk owner',
            },
        ]);
        mockGetProcessDepartments.mockImplementation(({ q }: { q?: string } = {}) => Promise.resolve(
            q === 'fin'
                ? [{ id: 4, name: 'Finance', code: 'FIN' }]
                : [{ id: 3, name: 'Operations', code: 'OPS' }],
        ));
        mockGetAssetOwners.mockResolvedValue([
            {
                id: 17,
                name: 'Asset Owner',
                email: 'asset-owner@example.com',
                department_id: 3,
                department_name: 'Operations',
                role_name: 'Business user',
            },
        ]);
        mockGetAssetDepartments.mockImplementation(({ q }: { q?: string } = {}) => Promise.resolve(
            q === 'fin'
                ? [{ id: 4, name: 'Finance', code: 'FIN' }]
                : [{ id: 3, name: 'Operations', code: 'OPS' }],
        ));
        mockGetVendorOwners.mockResolvedValue([
            {
                id: 27,
                name: 'Cross Department Owner',
                email: 'cross-owner@example.com',
                department_id: 4,
                department_name: 'Finance',
                role_name: 'Employee',
            },
        ]);
        mockGetThreatStewards.mockResolvedValue([
            {
                id: 37,
                name: 'Backup CISO',
                email: 'backup-ciso@example.com',
            },
        ]);
        mockGetRisks.mockResolvedValue({
            items: [
                {
                    id: 77,
                    risk_id_code: 'R-77',
                    name: 'Target Risk',
                    process: 'Ops',
                    risk_type: 'operational',
                    category: 'Process',
                    description: 'Risk target',
                    gross_score: 1,
                    gross_probability: 1,
                    gross_impact: 1,
                    net_score: 1,
                    status: 'active',
                    is_priority: false,
                    department_name: 'Operations',
                },
            ],
        });
        mockGetLinkedRisks.mockResolvedValue([{ id: 77, name: 'Target Risk' }]);
        mockResolveOrphan.mockResolvedValue({ message: 'resolved' });
    });

    it('lets a delegated operator submit a downstream-governed Process orphan without resource read access', async () => {
        mockResolveOrphan.mockResolvedValue(approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 92,
            action_type: 'edit',
            pending_fields: ['process_owner_user_id'],
        }));
        await openModal(orphan({
            item_type: 'process',
            item_name: 'Composite governed process',
            request_reason_required: true,
            capabilities: {
                can_resolve: true,
                can_view_detail: false,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.click(screen.getByRole('button', { name: /Ops Owner.*ops@example.com/i }));
        const reason = screen.getByTestId('resolve-orphan-request-reason');
        fireEvent.change(reason, { target: { value: 'Restore composite accountability' } });
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: 3,
            new_owner_id: 7,
            request_reason: 'Restore composite accountability',
            target_risk_id: undefined,
        }));
    });

    it('resolves directly without a reason when the authoritative orphan policy says none is required', async () => {
        mockResolveOrphan.mockResolvedValue({
            status: 'resolved',
            orphan_id: 901,
            new_owner_id: 7,
        });
        const { onClose, onResolved } = await openModal(orphan({
            item_type: 'process',
            item_name: 'Claims handling',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.click(screen.getByRole('button', { name: /Ops Owner.*ops@example.com/i }));
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: 3,
            new_owner_id: 7,
            target_risk_id: undefined,
        }));
        expect(onResolved).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('recovers when the backend requires a reason after a stale direct-resolution projection', async () => {
        mockResolveOrphan
            .mockRejectedValueOnce(new ApiClientError({
                status: 422,
                code: 'governed_mutation_reason_required',
                messageKey: 'errorKeys.validation',
                rawMessage: 'A request reason is mandatory for this governed reassignment',
            }))
            .mockResolvedValueOnce(approvalCreatedResponseSchema.parse({
                status: 'approval_required',
                message: 'Submitted',
                approval_id: 93,
                action_type: 'edit',
                pending_fields: ['process_owner_user_id'],
            }));
        await openModal(orphan({
            item_type: 'process',
            item_name: 'Newly governed process',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: false,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.click(screen.getByRole('button', { name: /Ops Owner.*ops@example.com/i }));
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        const reason = await screen.findByTestId('resolve-orphan-request-reason');
        expect(reason).toBeRequired();
        expect(screen.getAllByText('A reason is required for this governed reassignment.')).not.toHaveLength(0);
        fireEvent.change(reason, { target: { value: 'Policy changed while this queue was open' } });
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenNthCalledWith(2, 901, {
            department_id: 3,
            new_owner_id: 7,
            request_reason: 'Policy changed while this queue was open',
            target_risk_id: undefined,
        }));
        expect(mockResolveOrphan).toHaveBeenNthCalledWith(1, 901, {
            department_id: 3,
            new_owner_id: 7,
            target_risk_id: undefined,
        });
    });

    it('keeps unrelated 422 errors generic without forcing a reason field', async () => {
        mockResolveOrphan.mockRejectedValueOnce(new ApiClientError({
            status: 422,
            code: 'unrelated_validation_error',
            messageKey: 'errorKeys.validation',
            rawMessage: 'Another validation rule failed',
        }));
        await openModal(orphan({
            item_type: 'process',
            item_name: 'Invalid direct resolution',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: false,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.click(screen.getByRole('button', { name: /Ops Owner.*ops@example.com/i }));
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        expect(await screen.findByText('Some fields are invalid. Please review and try again.'))
            .toBeInTheDocument();
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('clears the backend reason-required override after the modal is closed and reopened', async () => {
        mockResolveOrphan.mockRejectedValueOnce(new ApiClientError({
            status: 422,
            code: 'governed_mutation_reason_required',
            messageKey: 'errorKeys.validation',
            rawMessage: 'A request reason is mandatory for this governed reassignment',
        }));
        const staleOrphan = orphan({
            item_type: 'process',
            item_name: 'Reopened direct resolution',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: false,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        });
        const props = {
            onClose: vi.fn(),
            onResolved: vi.fn(),
            orphan: staleOrphan,
        };
        const { rerender } = render(<ResolveOrphanModal isOpen {...props} />);
        await screen.findByTestId('resolve-orphan-ready');

        fireEvent.click(screen.getByRole('button', { name: /Ops Owner.*ops@example.com/i }));
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));
        expect(await screen.findByTestId('resolve-orphan-request-reason')).toBeInTheDocument();

        rerender(<ResolveOrphanModal isOpen={false} {...props} />);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        rerender(<ResolveOrphanModal isOpen {...props} />);

        await screen.findByTestId('resolve-orphan-ready');
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
    });

    it('submits selected owner and seeded department for risk ownership resolution', async () => {
        const props = await openModal(orphan());

        fireEvent.click(await screen.findByText('Ops Owner'));
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => {
            expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
                department_id: 3,
                new_owner_id: 7,
                target_risk_id: undefined,
            });
        });
        expect(props.onResolved).toHaveBeenCalled();
        expect(props.onClose).toHaveBeenCalled();
    });

    it('requires and submits a target risk for KRI orphan resolution', async () => {
        await openModal(orphan({
            item_type: 'kri',
            item_name: 'KRI A',
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: false,
                requires_owner: false,
                requires_risk: true,
            },
        }));

        expect(screen.getByText(/Risk Linkage Required/i)).toBeInTheDocument();
        fireEvent.click(await screen.findByText('Target Risk'));
        fireEvent.click(screen.getByRole('button', { name: /Link Risk/i }));

        await waitFor(() => {
            expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
                department_id: undefined,
                new_owner_id: undefined,
                target_risk_id: 77,
            });
        });
    });

    it('requires a risk when a control has no linked risks', async () => {
        mockGetLinkedRisks.mockResolvedValue([]);
        await openModal(orphan({ item_type: 'control', item_name: 'Control A' }));

        expect(await screen.findByText(/Risk Linkage Required/i)).toBeInTheDocument();
    });

    it('allows department-only fallback for a control without a selected owner', async () => {
        await openModal(orphan({
            item_type: 'control',
            item_name: 'Control A',
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: false,
                requires_risk: false,
            },
        }));

        fireEvent.click(await screen.findByText('Operations'));
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => {
            expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
                department_id: 3,
                new_owner_id: undefined,
                target_risk_id: undefined,
            });
        });
    });

    it('renders API errors without closing the modal', async () => {
        mockResolveOrphan.mockRejectedValue(new Error('failed'));
        const onClose = vi.fn();
        await openModal(orphan(), { onClose });

        fireEvent.click(await screen.findByText('Ops Owner'));
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await screen.findByText(/Something went wrong/i);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('requires and focuses a reason, then queues Process owner and Department reassignment without resolving it immediately', async () => {
        const onApprovalQueued = vi.fn();
        const onClose = vi.fn();
        const onResolved = vi.fn();
        mockResolveOrphan.mockResolvedValue(approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 88,
            action_type: 'edit',
            pending_fields: ['process_owner_user_id', 'owning_department_id'],
        }));
        const { container } = await openModal(orphan({
            item_type: 'process',
            item_name: 'Claims handling',
            item_identifier: 'F74',
            request_reason_required: true,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }), {
            onApprovalQueued,
            onClose,
            onResolved,
        });

        expect(screen.getByText(/Owner Selection Required/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /FIN Finance/i })).not.toBeInTheDocument();
        fireEvent.change(screen.getByTestId('process-department-search'), { target: { value: 'fin' } });
        const finance = await screen.findByRole('button', { name: /FIN Finance/i });
        expect(finance).toHaveAttribute('type', 'button');
        fireEvent.click(finance);
        const owner = screen.getByRole('button', { name: /Ops Owner.*ops@example.com.*Operations/i });
        expect(owner).toHaveAttribute('type', 'button');
        fireEvent.click(owner);
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        const reason = screen.getByTestId('resolve-orphan-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        expect(screen.getAllByText('A reason is required for this governed reassignment.')).not.toHaveLength(0);
        expect(mockResolveOrphan).not.toHaveBeenCalled();

        fireEvent.change(reason, { target: { value: 'Assign accountable Process ownership' } });
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        await waitFor(() => {
            expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
                department_id: 4,
                new_owner_id: 7,
                request_reason: 'Assign accountable Process ownership',
                target_risk_id: undefined,
            });
        });
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 88 }));
        expect(onResolved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();

        expect(mockGetProcessOwners).toHaveBeenCalledWith({ limit: 50, q: undefined });
        expect(mockGetProcessDepartments).toHaveBeenCalledWith({ limit: 50, q: undefined });
        expect(mockGetProcessDepartments).toHaveBeenCalledWith({ limit: 50, q: 'fin' });
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockGetDepartments).not.toHaveBeenCalled();

        const results = await axe.run(container, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('supports a direct Process resolution when the authoritative policy does not require a reason', async () => {
        mockResolveOrphan.mockResolvedValue({
            status: 'resolved',
            orphan_id: 901,
            new_owner_id: 7,
        });
        const onClose = vi.fn();
        const onResolved = vi.fn();
        await openModal(orphan({
            item_type: 'process',
            item_name: 'Direct Process resolution',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }), { onClose, onResolved });

        fireEvent.click(await screen.findByRole('button', { name: /Ops Owner.*ops@example.com.*Operations/i }));
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('searches Process owners through the purpose-scoped lookup', async () => {
        await openModal(orphan({
            item_type: 'process',
            item_name: 'Claims handling',
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.change(screen.getByTestId('orphan-owner-search'), { target: { value: 'ops' } });

        await waitFor(() => {
            expect(mockGetProcessOwners).toHaveBeenCalledWith({ limit: 50, q: 'ops' });
        });
    });

    it.each([
        ['business_owner', 'Business Owner responsibility'],
        ['ict_owner', 'ICT Owner responsibility'],
    ] as const)('renders the role-specific Asset reassignment context for %s', async (responsibilityRole, label) => {
        await openModal(orphan({
            item_type: 'asset',
            item_name: 'Payroll database',
            responsibility_role: responsibilityRole,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        expect(screen.getByText(label)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(`Reassign the ${responsibilityRole === 'business_owner' ? 'Business' : 'ICT'} Owner`))).toBeInTheDocument();
    });

    it('requires a reason and keeps an Asset orphan open when reassignment queues for approval', async () => {
        const onApprovalQueued = vi.fn();
        const onClose = vi.fn();
        const onResolved = vi.fn();
        mockResolveOrphan.mockResolvedValue(approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 89,
            action_type: 'edit',
            pending_fields: ['business_owner_user_id', 'owning_department_id'],
        }));
        const { container } = await openModal(orphan({
            item_type: 'asset',
            item_name: 'Payroll database',
            responsibility_role: 'business_owner',
            request_reason_required: true,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }), {
            onApprovalQueued,
            onClose,
            onResolved,
        });

        fireEvent.click(screen.getByRole(
            'button',
            { name: /Asset Owner.*asset-owner@example.com.*Operations/i },
        ));
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        const reason = screen.getByTestId('resolve-orphan-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        expect(screen.getAllByText('A reason is required for this governed reassignment.'))
            .not.toHaveLength(0);
        expect(mockResolveOrphan).not.toHaveBeenCalled();

        fireEvent.change(reason, {
            target: { value: 'Restore accountable Asset ownership' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: 3,
            new_owner_id: 17,
            request_reason: 'Restore accountable Asset ownership',
            target_risk_id: undefined,
        }));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 89 }));
        expect(onResolved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();

        const results = await axe.run(container, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('uses Asset-purpose lookups and submits owner plus independently selected Department atomically', async () => {
        mockResolveOrphan.mockResolvedValue({
            status: 'resolved',
            orphan_id: 901,
            new_owner_id: 17,
        });
        const { container, onClose, onResolved } = await openModal(orphan({
            item_type: 'asset',
            item_name: 'Payroll database',
            responsibility_role: 'business_owner',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.change(screen.getByTestId('process-department-search'), { target: { value: 'fin' } });
        fireEvent.click(await screen.findByRole('button', { name: /FIN Finance/i }));
        fireEvent.click(screen.getByRole('button', { name: /Asset Owner.*asset-owner@example.com.*Operations/i }));
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: 4,
            new_owner_id: 17,
            target_risk_id: undefined,
        }));
        expect(onResolved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockGetAssetOwners).toHaveBeenCalledWith({ limit: 50, q: undefined });
        expect(mockGetAssetDepartments).toHaveBeenCalledWith({ limit: 50, q: undefined });
        expect(mockGetAssetDepartments).toHaveBeenCalledWith({ limit: 50, q: 'fin' });
        expect(mockGetProcessOwners).not.toHaveBeenCalled();
        expect(mockGetProcessDepartments).not.toHaveBeenCalled();
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockGetDepartments).not.toHaveBeenCalled();

        const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('requires a reason and keeps a Vendor orphan open when reassignment queues for approval', async () => {
        const onApprovalQueued = vi.fn();
        const onClose = vi.fn();
        const onResolved = vi.fn();
        mockResolveOrphan.mockResolvedValue(approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 90,
            action_type: 'edit',
            pending_fields: ['outsourcing_owner_user_id'],
        }));
        const { container } = await openModal(orphan({
            item_type: 'vendor',
            item_name: 'Cloud Provider',
            responsibility_role: 'outsourcing_owner',
            request_reason_required: true,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: false,
                requires_owner: true,
                requires_risk: false,
            },
        }), {
            onApprovalQueued,
            onClose,
            onResolved,
        });

        fireEvent.click(screen.getByRole(
            'button',
            { name: /Cross Department Owner.*cross-owner@example.com.*Finance/i },
        ));
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        const reason = screen.getByTestId('resolve-orphan-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        fireEvent.change(reason, {
            target: { value: 'Restore accountable Vendor ownership' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: undefined,
            new_owner_id: 27,
            request_reason: 'Restore accountable Vendor ownership',
            target_risk_id: undefined,
        }));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 90 }));
        expect(onResolved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();

        const results = await axe.run(container, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('resolves a Vendor through its purpose-scoped owner lookup without a Department write', async () => {
        mockResolveOrphan.mockResolvedValue({
            status: 'resolved',
            orphan_id: 901,
            new_owner_id: 27,
        });
        const { onClose, onResolved } = await openModal(orphan({
            item_type: 'vendor',
            item_name: 'Cloud Provider',
            responsibility_role: 'outsourcing_owner',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: false,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        expect(screen.getByText('Outsourcing Owner responsibility')).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('orphan-owner-search'), { target: { value: 'cross' } });
        await waitFor(() => expect(mockGetVendorOwners).toHaveBeenCalledWith({ limit: 50, q: 'cross' }));
        fireEvent.click(screen.getByRole('button', { name: /Cross Department Owner.*cross-owner@example.com.*Finance/i }));
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: undefined,
            new_owner_id: 27,
            target_risk_id: undefined,
        }));
        expect(onResolved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockGetDepartments).not.toHaveBeenCalled();
    });

    it('requires a reason and keeps a Threat orphan open when reassignment queues for approval', async () => {
        const onApprovalQueued = vi.fn();
        const onClose = vi.fn();
        const onResolved = vi.fn();
        mockResolveOrphan.mockResolvedValue(approvalCreatedResponseSchema.parse({
            status: 'approval_required',
            message: 'Submitted',
            approval_id: 91,
            action_type: 'edit',
            pending_fields: ['threat_steward_user_id'],
        }));
        const { container } = await openModal(orphan({
            item_type: 'threat',
            item_name: 'Ransomware',
            responsibility_role: 'threat_steward',
            request_reason_required: true,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: false,
                requires_owner: true,
                requires_risk: false,
            },
        }), {
            onApprovalQueued,
            onClose,
            onResolved,
        });

        fireEvent.click(screen.getByRole(
            'button',
            { name: /Backup CISO.*backup-ciso@example.com/i },
        ));
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        const reason = screen.getByTestId('resolve-orphan-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveFocus();
        fireEvent.change(reason, {
            target: { value: 'Restore active CISO stewardship' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Submit for approval/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: undefined,
            new_owner_id: 37,
            request_reason: 'Restore active CISO stewardship',
            target_risk_id: undefined,
        }));
        expect(onApprovalQueued).toHaveBeenCalledWith(expect.objectContaining({ approval_id: 91 }));
        expect(onResolved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(mockGetThreatStewards).toHaveBeenCalledWith({
            limit: 50,
            q: undefined,
        });
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockGetDepartments).not.toHaveBeenCalled();

        const results = await axe.run(container, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('preserves direct Threat resolution when the authoritative policy does not require a reason', async () => {
        mockResolveOrphan.mockResolvedValue({
            status: 'resolved',
            orphan_id: 901,
            new_owner_id: 37,
        });
        const { onClose, onResolved } = await openModal(orphan({
            item_type: 'threat',
            item_name: 'Direct Threat resolution',
            responsibility_role: 'threat_steward',
            request_reason_required: false,
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: false,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        fireEvent.click(screen.getByRole(
            'button',
            { name: /Backup CISO.*backup-ciso@example.com/i },
        ));
        expect(screen.queryByTestId('resolve-orphan-request-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
            department_id: undefined,
            new_owner_id: 37,
            target_risk_id: undefined,
        }));
        expect(onResolved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['process', mockGetProcessOwners, 'Process'],
        ['asset', mockGetAssetOwners, 'Asset'],
        ['vendor', mockGetVendorOwners, 'Vendor'],
    ] as const)('logs %s owner-search failures with the matching entity name', async (itemType, lookupMock, entityName) => {
        await openModal(orphan({ item_type: itemType, item_name: `${entityName} lookup failure` }));
        await screen.findByTestId('resolve-orphan-ready');
        await waitFor(() => expect(lookupMock).toHaveBeenCalledTimes(2));

        const lookupError = new Error(`${itemType} lookup failed`);
        lookupMock.mockRejectedValueOnce(lookupError);
        fireEvent.change(screen.getByTestId('orphan-owner-search'), { target: { value: 'missing owner' } });

        await waitFor(() => expect(mockLogError).toHaveBeenCalledWith(
            `Failed to search ${entityName} owners:`,
            lookupError,
        ));
    });

    it('ignores late Asset owner and Department results after switching orphan type', async () => {
        const owners = deferred<Array<{ id: number; name: string; email: string; department_id: number; department_name: string }>>();
        const departments = deferred<Array<{ id: number; name: string; code: string }>>();
        mockGetAssetOwners.mockImplementationOnce(() => owners.promise);
        mockGetAssetDepartments.mockImplementationOnce(() => departments.promise);

        const { rerender } = render(<ResolveOrphanModal isOpen onClose={vi.fn()} onResolved={vi.fn()} orphan={orphan({ item_type: 'asset', item_name: 'Slow Asset', responsibility_role: 'ict_owner' })} />);
        await waitFor(() => {
            expect(mockGetAssetOwners).toHaveBeenCalledTimes(1);
            expect(mockGetAssetDepartments).toHaveBeenCalledTimes(1);
        });
        rerender(<ResolveOrphanModal isOpen onClose={vi.fn()} onResolved={vi.fn()} orphan={orphan({ item_name: 'Next Risk' })} />);
        expect(await screen.findByText('Next Risk')).toBeInTheDocument();
        expect(await screen.findByText('Ops Owner')).toBeInTheDocument();

        await act(async () => {
            owners.resolve([{ id: 99, name: 'Late Asset User', email: 'late@example.com', department_id: 4, department_name: 'Finance' }]);
            departments.resolve([{ id: 4, name: 'Late Asset Department', code: 'LATE' }]);
            await Promise.all([owners.promise, departments.promise]);
        });
        expect(screen.queryByText('Late Asset User')).not.toBeInTheDocument();
        expect(screen.queryByText('Late Asset Department')).not.toBeInTheDocument();
        expect(screen.getByText('Ops Owner')).toBeInTheDocument();
    });

    it('ignores late Process owner and Department results after switching to a Risk orphan', async () => {
        const owners = deferred<Array<{
            id: number;
            name: string;
            email: string;
            department_id: number;
            department_name: string;
        }>>();
        const departments = deferred<Array<{ id: number; name: string; code: string }>>();
        mockGetProcessOwners.mockImplementationOnce(() => owners.promise);
        mockGetProcessDepartments.mockImplementationOnce(() => departments.promise);

        const { rerender } = render(
            <ResolveOrphanModal
                isOpen
                onClose={vi.fn()}
                onResolved={vi.fn()}
                orphan={orphan({ item_type: 'process', item_name: 'Slow Process' })}
            />,
        );
        await waitFor(() => {
            expect(mockGetProcessOwners).toHaveBeenCalledTimes(1);
            expect(mockGetProcessDepartments).toHaveBeenCalledTimes(1);
        });

        rerender(
            <ResolveOrphanModal
                isOpen
                onClose={vi.fn()}
                onResolved={vi.fn()}
                orphan={orphan({ item_name: 'Next Risk' })}
            />,
        );
        expect(await screen.findByText('Next Risk')).toBeInTheDocument();
        expect(await screen.findByText('Ops Owner')).toBeInTheDocument();

        await act(async () => {
            owners.resolve([{
                id: 99,
                name: 'Late Process Admin',
                email: 'admin@example.com',
                department_id: 4,
                department_name: 'Finance',
            }]);
            departments.resolve([{ id: 4, name: 'Late Finance', code: 'FIN' }]);
            await Promise.all([owners.promise, departments.promise]);
        });

        expect(screen.queryByText('Late Process Admin')).not.toBeInTheDocument();
        expect(screen.queryByText('Late Finance')).not.toBeInTheDocument();
        expect(screen.getByText('Ops Owner')).toBeInTheDocument();
        expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });

    it('suppresses late Process lookup errors after switching orphan type', async () => {
        const owners = deferred<never[]>();
        const departments = deferred<never[]>();
        mockGetProcessOwners.mockImplementationOnce(() => owners.promise);
        mockGetProcessDepartments.mockImplementationOnce(() => departments.promise);

        const { rerender } = render(
            <ResolveOrphanModal
                isOpen
                onClose={vi.fn()}
                onResolved={vi.fn()}
                orphan={orphan({ item_type: 'process', item_name: 'Failing Process' })}
            />,
        );
        await waitFor(() => expect(mockGetProcessDepartments).toHaveBeenCalledTimes(1));
        rerender(
            <ResolveOrphanModal
                isOpen
                onClose={vi.fn()}
                onResolved={vi.fn()}
                orphan={orphan({ item_type: 'control', item_name: 'Next Control' })}
            />,
        );
        expect(await screen.findByText('Next Control')).toBeInTheDocument();

        await act(async () => {
            owners.reject(new Error('late owner failure'));
            departments.reject(new Error('late department failure'));
            await Promise.allSettled([owners.promise, departments.promise]);
        });

        expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
        expect(screen.getByText('Ops Owner')).toBeInTheDocument();
    });
});
