import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import type { ProcessPendingCreationRead } from '@/types/process';

const mocks = vi.hoisted(() => ({
    cancel: vi.fn(),
    fetchProcesses: vi.fn(),
}));

const pendingCreation: ProcessPendingCreationRead = {
    approval_id: 85,
    proposal_id: 'proposal-create-85',
    proposal_version: 1,
    status: 'pending_creation',
    requested_at: '2026-07-17T00:00:00Z',
    requested_by_name: 'Alice',
    reason: 'New critical function',
    proposed: {
        l1_process: 'Critical settlement',
        process_owner: 'Alice Owner',
        owning_department: 'Operations',
    },
    derived: { cif: 'yes', criticality_class: 'critical' },
    capabilities: {
        can_view_diff: true,
        can_cancel: true,
        is_requester: true,
        can_resolve: false,
    },
};

vi.mock('@/services/approvalsApi', () => ({
    approvalsApi: { cancel: (...args: unknown[]) => mocks.cancel(...args) },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

vi.mock('@/i18n/hooks', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/i18n/hooks')>();
    return {
        ...actual,
        useLanguage: () => ({ language: 'en' }),
    };
});

vi.mock('@/components/ict-register/RegisterListShell', () => ({
    RegisterListShell: ({ toolbar }: { toolbar: React.ReactNode }) => <main>{toolbar}</main>,
}));

vi.mock('@/pages/processes/useProcessesPageState', () => ({
    useProcessesPageState: () => ({
        capabilities: { can_create: true, can_export: true },
        clearFilters: vi.fn(),
        clearSelectedGroup: vi.fn(),
        currentPage: 1,
        errorKey: null,
        exportProcesses: vi.fn(),
        facets: {},
        fetchProcesses: mocks.fetchProcesses,
        filters: {},
        groups: [],
        hasLoadedOnce: true,
        isAccessDenied: false,
        isExporting: false,
        isLoading: false,
        items: [],
        limit: 25,
        pendingCreations: [pendingCreation],
        restoreProcess: vi.fn(),
        search: '',
        selectGroup: vi.fn(),
        selectedGroupLabel: null,
        selectedGroupValue: null,
        setCurrentPage: vi.fn(),
        sortDirection: null,
        sortField: null,
        totalCount: 0,
        totalPages: 1,
        updateFilter: vi.fn(),
        updateSearch: vi.fn(),
        updateSort: vi.fn(),
        updateViewMode: vi.fn(),
        viewMode: 'all',
    }),
}));

vi.mock('@/pages/shared/useIctRegisterPageState', () => ({
    useIctRegisterSemanticPageState: () => ({
        semanticFilters: {},
        presentedSemanticFilters: [],
        removeSemanticFilter: vi.fn(),
    }),
}));

import { ProcessesPage } from '@/pages/ProcessesPage';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProcesses.mockResolvedValue(undefined);
});

describe('ProcessesPage pending creation cancellation', () => {
    it('confirms before cancelling (GAP-D-08) and keeps a failure inside the dialog for retry', async () => {
        let rejectCancellation: (reason?: unknown) => void = () => undefined;
        mocks.cancel.mockImplementationOnce(() => new Promise((_, reject) => {
            rejectCancellation = reject;
        }));
        render(
            <MemoryRouter>
                <ProcessesPage />
            </MemoryRouter>,
        );

        const cancelButton = screen.getByRole('button', { name: i18n.t('processes:pending_change.cancel') });
        expect(cancelButton).toHaveAccessibleDescription('Critical settlement');
        fireEvent.click(cancelButton);

        // Nothing is cancelled until the confirmation is accepted.
        expect(mocks.cancel).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('Critical settlement');

        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:pending_change_cancellation.confirm') }));
        await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith(85));

        await act(async () => rejectCancellation(new Error('network unavailable')));
        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent(i18n.t('processes:pending_creation.cancel_failed'));
        expect(mocks.fetchProcesses).not.toHaveBeenCalled();

        const axeResult = await axe.run(dialog, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(axeResult.violations).toEqual([]);

        mocks.cancel.mockResolvedValueOnce(undefined);
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.retry') }));
        await waitFor(() => expect(mocks.cancel).toHaveBeenLastCalledWith(85));
        await waitFor(() => expect(mocks.fetchProcesses).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('closing the confirmation leaves the pending creation untouched', async () => {
        render(
            <MemoryRouter>
                <ProcessesPage />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: i18n.t('processes:pending_change.cancel') }));
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));

        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(mocks.cancel).not.toHaveBeenCalled();
    });
});
