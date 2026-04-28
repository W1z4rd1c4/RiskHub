import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkManagementDialog } from '@/components/LinkManagementDialog';

type LinkMode = ComponentProps<typeof LinkManagementDialog>['mode'];

const mockGetDepartments = vi.fn();
const mockGetRiskFilters = vi.fn();
const mockGetRisks = vi.fn();
const mockRestoreRisk = vi.fn();
const mockGetControls = vi.fn();
const mockRestoreControl = vi.fn();
const mockGetKRIs = vi.fn();
const mockRestoreKRI = vi.fn();

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        hasPermission: (resource: string, action: string) => (
            (resource === 'risks' || resource === 'controls') && action === 'delete'
        ),
    }),
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        emptyLabel,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
        emptyLabel?: string;
    }) => (
        <select
            aria-label={placeholder}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            <option value="">{emptyLabel ?? placeholder}</option>
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getDepartments: (...args: unknown[]) => mockGetDepartments(...args),
        getRiskFilters: (...args: unknown[]) => mockGetRiskFilters(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
        restoreRisk: (...args: unknown[]) => mockRestoreRisk(...args),
    },
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControls: (...args: unknown[]) => mockGetControls(...args),
        restoreControl: (...args: unknown[]) => mockRestoreControl(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRIs: (...args: unknown[]) => mockGetKRIs(...args),
        restoreKRI: (...args: unknown[]) => mockRestoreKRI(...args),
    },
}));

function collection<T>(items: T[]) {
    return {
        items,
        total: items.length,
        offset: 0,
        limit: 20,
    };
}

function riskResult(id: number, description: string, status = 'active') {
    return {
        id,
        risk_id_code: `R-${id}`,
        name: `Risk ${id}`,
        description,
        process: 'Claims',
        category: 'Operational',
        status,
    };
}

function controlResult(
    id: number,
    name: string,
    status = 'active',
    capabilities: { can_restore?: boolean } = {},
) {
    return {
        id,
        name,
        description: `${name} description`,
        department: { name: 'Risk' },
        department_name: 'Risk',
        control_owner_name: 'Control Owner',
        frequency: 'monthly',
        risk_level: 3,
        status,
        capabilities,
    };
}

function kriResult(id: number, metricName: string, isArchived = false) {
    return {
        id,
        risk_id: 40,
        metric_name: metricName,
        description: `${metricName} description`,
        process: 'Claims',
        category: 'Operational',
        risk_process: 'Claims',
        risk_category: 'Operational',
        risk_department_name: 'Risk',
        is_archived: isArchived,
        monitoring_status: isArchived ? 'archived' : 'optimal',
    };
}

function defaultProps(overrides?: Partial<ComponentProps<typeof LinkManagementDialog>>) {
    return {
        mode: 'risk-to-control' as LinkMode,
        existingLinks: [],
        onLink: vi.fn(async () => undefined),
        onUnlink: vi.fn(async () => undefined),
        isOpen: true,
        onClose: vi.fn(),
        ...overrides,
    };
}

async function flushPromises() {
    await act(async () => {
        await Promise.resolve();
    });
}

async function advanceDebounce() {
    await act(async () => {
        vi.advanceTimersByTime(300);
    });
    await flushPromises();
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe('LinkManagementDialog', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockGetDepartments.mockResolvedValue([
            { id: 1, name: 'Risk' },
            { id: 2, name: 'Operations' },
        ]);
        mockGetRiskFilters.mockResolvedValue({
            processes: ['Claims', 'Finance'],
            categories: ['Operational', 'Technology'],
        });
        mockGetRisks.mockResolvedValue(collection([]));
        mockGetControls.mockResolvedValue(collection([]));
        mockGetKRIs.mockResolvedValue(collection([]));
        mockRestoreRisk.mockResolvedValue({});
        mockRestoreControl.mockResolvedValue({});
        mockRestoreKRI.mockResolvedValue({});
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('renders through the portal and loads lookups only when open search is shown', async () => {
        const { rerender } = render(<LinkManagementDialog {...defaultProps({ isOpen: false })} />);

        expect(screen.queryByTestId('link-management-dialog')).not.toBeInTheDocument();
        expect(mockGetDepartments).not.toHaveBeenCalled();

        rerender(<LinkManagementDialog {...defaultProps({ isOpen: true })} />);
        await flushPromises();

        expect(screen.getByTestId('link-management-dialog')).toBeInTheDocument();
        expect(mockGetDepartments).toHaveBeenCalledTimes(1);
        expect(mockGetRiskFilters).toHaveBeenCalledTimes(1);

        rerender(<LinkManagementDialog {...defaultProps({ isOpen: true, showSearch: false })} />);
        await flushPromises();

        expect(mockGetDepartments).toHaveBeenCalledTimes(1);
        expect(mockGetRiskFilters).toHaveBeenCalledTimes(1);
    });

    it.each([
        {
            mode: 'control-to-risk' as LinkMode,
            existingLinks: [{ id: 1, risk_id: 101, effectiveness: 'high' }],
            setup: () => mockGetRisks.mockResolvedValue(collection([
                riskResult(101, 'Already linked risk'),
                riskResult(102, 'Visible risk result'),
            ])),
            expectedApi: mockGetRisks,
            visibleText: 'Visible risk result',
            hiddenText: 'Already linked risk',
        },
        {
            mode: 'risk-to-control' as LinkMode,
            existingLinks: [{ id: 1, control_id: 201, effectiveness: 'high' }],
            setup: () => mockGetControls.mockResolvedValue(collection([
                controlResult(201, 'Already linked control'),
                controlResult(202, 'Visible control result'),
            ])),
            expectedApi: mockGetControls,
            visibleText: 'Visible control result',
            hiddenText: 'Already linked control',
        },
        {
            mode: 'vendor-to-kri' as LinkMode,
            existingLinks: [{ id: 1, kri_id: 301, effectiveness: 'linked' }],
            setup: () => mockGetKRIs.mockResolvedValue(collection([
                kriResult(301, 'Already linked KRI'),
                kriResult(302, 'Visible KRI result'),
            ])),
            expectedApi: mockGetKRIs,
            visibleText: 'Visible KRI result',
            hiddenText: 'Already linked KRI',
        },
    ])('searches and filters linked results in $mode mode', async ({
        mode,
        existingLinks,
        setup,
        expectedApi,
        visibleText,
        hiddenText,
    }) => {
        setup();
        render(<LinkManagementDialog {...defaultProps({ mode, existingLinks })} />);

        await advanceDebounce();

        expect(expectedApi).toHaveBeenCalledTimes(1);
        expect(screen.getByText(visibleText)).toBeInTheDocument();
        expect(screen.queryByText(hiddenText)).not.toBeInTheDocument();
    });

    it('ignores stale search responses when a later request completes first', async () => {
        const first = deferred<ReturnType<typeof collection>>();
        const second = deferred<ReturnType<typeof collection>>();
        mockGetControls
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        render(<LinkManagementDialog {...defaultProps({ mode: 'risk-to-control' })} />);

        await advanceDebounce();
        fireEvent.change(screen.getByPlaceholderText(/search controls/i), {
            target: { value: 'second' },
        });
        await advanceDebounce();

        second.resolve(collection([controlResult(2, 'Second response control')]));
        await flushPromises();
        expect(screen.getByText('Second response control')).toBeInTheDocument();

        first.resolve(collection([controlResult(1, 'Stale response control')]));
        await flushPromises();
        expect(screen.queryByText('Stale response control')).not.toBeInTheDocument();
        expect(screen.getByText('Second response control')).toBeInTheDocument();
    });

    it('links the selected target with default metadata and closes on success', async () => {
        const onLink = vi.fn(async () => undefined);
        const onClose = vi.fn();
        mockGetControls.mockResolvedValue(collection([controlResult(202, 'Visible control result')]));

        render(<LinkManagementDialog {...defaultProps({ onLink, onClose })} />);
        await advanceDebounce();

        fireEvent.click(screen.getByText('Visible control result'));
        fireEvent.click(screen.getByRole('button', { name: /create link/i }));

        await flushPromises();
        expect(onLink).toHaveBeenCalledWith(202, 'medium', '');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('confirms unlink before calling the parent unlink handler', async () => {
        const onUnlink = vi.fn(async () => undefined);
        render(<LinkManagementDialog
            {...defaultProps({
                existingLinks: [{ id: 4, control_id: 204, display_name: 'Existing control', effectiveness: 'medium' }],
                onUnlink,
                showSearch: false,
            })}
        />);

        const row = screen.getByText('Existing control').closest('.group');
        expect(row).not.toBeNull();
        fireEvent.click(within(row as HTMLElement).getByRole('button'));
        fireEvent.click(screen.getByRole('button', { name: /delete/i }));

        await flushPromises();
        expect(onUnlink).toHaveBeenCalledWith(204);
    });

    it('restores archived search results through the mode-specific API and refreshes search', async () => {
        mockGetControls.mockResolvedValue(collection([controlResult(203, 'Archived control', 'archived', { can_restore: true })]));

        render(<LinkManagementDialog {...defaultProps({ mode: 'risk-to-control' })} />);
        await advanceDebounce();

        fireEvent.click(screen.getAllByRole('button', { name: /unarchive/i }).at(-1)!);
        await flushPromises();

        expect(mockRestoreControl).toHaveBeenCalledWith(203);
        expect(mockGetControls).toHaveBeenCalledTimes(2);
    });

    it('hides archived restore action when backend capability denies it', async () => {
        mockGetControls.mockResolvedValue(collection([controlResult(204, 'Archived denied control', 'archived', { can_restore: false })]));

        render(<LinkManagementDialog {...defaultProps({ mode: 'risk-to-control' })} />);
        await advanceDebounce();

        expect(screen.getByText('Archived denied control')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /unarchive/i })).not.toBeInTheDocument();
    });

    it('resets local search, filters, and selection after close and reopen', async () => {
        mockGetControls.mockResolvedValue(collection([controlResult(202, 'Visible control result')]));

        const props = defaultProps();
        const { rerender } = render(<LinkManagementDialog {...props} isOpen />);
        await advanceDebounce();

        fireEvent.change(screen.getByPlaceholderText(/search controls/i), {
            target: { value: 'visible' },
        });
        fireEvent.click(screen.getByLabelText(/include archived/i));
        fireEvent.click(screen.getByText('Visible control result'));
        expect(screen.getByText(/confirm linkage/i)).toBeInTheDocument();

        rerender(<LinkManagementDialog {...props} isOpen={false} />);
        await flushPromises();
        rerender(<LinkManagementDialog {...props} isOpen />);

        expect(screen.getByPlaceholderText(/search controls/i)).toHaveValue('');
        expect(screen.getByLabelText(/include archived/i)).not.toBeChecked();
    });
});
