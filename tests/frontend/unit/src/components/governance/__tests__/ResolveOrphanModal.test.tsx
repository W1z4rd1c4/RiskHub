import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as axe from 'axe-core';

import { ResolveOrphanModal } from '@/components/governance/ResolveOrphanModal';
import type { OrphanedItem } from '@/types/orphanedItem';

const mockGetLinkedRisks = vi.fn();
const mockGetDepartments = vi.fn();
const mockResolveOrphan = vi.fn();
const mockGetRisks = vi.fn();
const mockListUsers = vi.fn();
const mockGetProcessOwners = vi.fn();
const mockGetProcessDepartments = vi.fn();

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

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getProcessOwners: (...args: unknown[]) => mockGetProcessOwners(...args),
        getProcessDepartments: (...args: unknown[]) => mockGetProcessDepartments(...args),
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

    it('requires and submits an independently editable Process owner and Owning Department', async () => {
        await openModal(orphan({
            item_type: 'process',
            item_name: 'Claims handling',
            item_identifier: 'F74',
            capabilities: {
                can_resolve: true,
                can_view_detail: true,
                requires_department: true,
                requires_owner: true,
                requires_risk: false,
            },
        }));

        expect(screen.getByText(/Owner Selection Required/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /FIN Finance/i })).not.toBeInTheDocument();
        fireEvent.change(screen.getByTestId('process-department-search'), { target: { value: 'fin' } });
        const finance = await screen.findByRole('button', { name: /FIN Finance/i });
        expect(finance).toHaveAttribute('type', 'button');
        fireEvent.click(finance);
        const owner = screen.getByRole('button', { name: /Ops Owner.*ops@example.com.*Operations/i });
        expect(owner).toHaveAttribute('type', 'button');
        fireEvent.click(owner);
        fireEvent.click(screen.getByRole('button', { name: /Resolve Item/i }));

        await waitFor(() => {
            expect(mockResolveOrphan).toHaveBeenCalledWith(901, {
                department_id: 4,
                new_owner_id: 7,
                target_risk_id: undefined,
            });
        });

        expect(mockGetProcessOwners).toHaveBeenCalledWith({ limit: 50, q: undefined });
        expect(mockGetProcessDepartments).toHaveBeenCalledWith({ limit: 50, q: undefined });
        expect(mockGetProcessDepartments).toHaveBeenCalledWith({ limit: 50, q: 'fin' });
        expect(mockListUsers).not.toHaveBeenCalled();
        expect(mockGetDepartments).not.toHaveBeenCalled();

        const results = await axe.run(document.body, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
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
