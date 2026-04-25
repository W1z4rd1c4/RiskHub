import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResolveOrphanModal } from '@/components/governance/ResolveOrphanModal';
import type { OrphanedItem } from '@/types/orphanedItem';

const mockGetLinkedRisks = vi.fn();
const mockGetDepartments = vi.fn();
const mockResolveOrphan = vi.fn();
const mockGetRisks = vi.fn();
const mockListUsers = vi.fn();

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
    render(<ResolveOrphanModal {...props} />);
    await screen.findByText(item.item_name);
    return props;
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
});
