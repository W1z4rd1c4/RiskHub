import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackProvider } from '@/contexts/FeedbackContext';
import '@/i18n';
import type { Process } from '@/types/process';

/**
 * FB-01 (Process divergence) / D12 / PM-2: an approval-routed Process edit or
 * archive keeps the user on the Process with the persistent pending notice and
 * a success toast, like every other module; PM-1: the archive reason is
 * optional when the archive is not routed through approval.
 */

const mocks = vi.hoisted(() => ({
    archiveProcess: vi.fn(),
    fetchProcess: vi.fn(),
    process: null as Process | null,
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: false }),
}));

vi.mock('@/services/processApi', () => ({
    processApi: {
        archiveProcess: (...args: unknown[]) => mocks.archiveProcess(...args),
        getProcesses: vi.fn().mockResolvedValue({ items: [] }),
    },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

vi.mock('@/pages/processes/useProcessDetailState', () => ({
    useProcessDetailState: () => ({
        canArchive: true,
        canEdit: true,
        canRestore: false,
        fetchProcess: mocks.fetchProcess,
        isRetrying: false,
        loadOutcome: 'content',
        process: mocks.process,
        processId: 74,
        restoreProcess: vi.fn(),
        setProcess: vi.fn(),
    }),
}));

vi.mock('@/pages/processes/ProcessForm', () => ({
    ProcessForm: ({ onApprovalQueued }: { onApprovalQueued?: (queued: { approval_id: number }) => void }) => (
        <button type="button" onClick={() => onApprovalQueued?.({ approval_id: 501 })}>queue-edit</button>
    ),
}));

vi.mock('@/pages/processes/ProcessVendorLinksSection', () => ({
    ProcessVendorLinksSection: () => <div data-testid="process-vendor-links" />,
}));

import { ProcessDetailPage } from '@/pages/ProcessDetailPage';

function processFixture(): Process {
    return {
        id: 74,
        f_code: 'F-074',
        l0_area: 'Claims',
        l1_process: 'Claims handling',
        owner_orphaned: false,
        ownership_status: 'assigned',
        is_archived: false,
        derived: null,
        capabilities: {
            can_read: true,
            can_update: true,
            can_archive: true,
            can_restore: false,
            protected_change_requires_approval: false,
        },
        created_at: '2026-07-15T10:00:00Z',
        updated_at: '2026-07-15T10:00:00Z',
    } as unknown as Process;
}

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
}

function renderAt(path: string, mode: 'view' | 'edit') {
    return render(
        <FeedbackProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/processes/:id/edit" element={<ProcessDetailPage mode="edit" />} />
                    <Route path="/processes/:id" element={<><ProcessDetailPage mode={mode === 'edit' ? 'view' : mode} /><LocationProbe /></>} />
                </Routes>
            </MemoryRouter>
        </FeedbackProvider>,
    );
}

describe('ProcessDetailPage approval-queued rule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.process = processFixture();
    });

    it('returns an approval-routed edit to the Process with the pending notice and a toast', async () => {
        renderAt('/processes/74/edit', 'edit');

        fireEvent.click(await screen.findByRole('button', { name: 'queue-edit' }));

        expect(await screen.findByTestId('location')).toHaveTextContent('/processes/74');
        const notice = screen.getByTestId('approval-queued-notice');
        expect(within(notice).getByRole('link')).toHaveAttribute('href', '/approvals?tab=mine&approvalId=501');
        expect((await screen.findByText('Submitted for approval')).closest('li')).toHaveAttribute('data-tone', 'success');
    });

    it('offers an optional reason for an unprotected archive and stays on the Process when it is queued', async () => {
        mocks.archiveProcess.mockResolvedValue({
            status: 'approval_required',
            message: 'Queued',
            approval_id: 502,
            action_type: 'delete',
            pending_fields: ['is_archived'],
            proposal_id: 'proposal-process-502',
            proposal_version: 1,
        });
        renderAt('/processes/74', 'view');

        const archiveButton = await screen.findByTestId('process-detail-archive');
        expect(archiveButton.querySelector('svg.lucide-archive')).not.toBeNull();
        fireEvent.click(archiveButton);
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByRole('heading', { name: 'Archive Process?' })).toBeInTheDocument();
        expect(within(dialog).getByRole('textbox')).toHaveAttribute('aria-required', 'false');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

        await waitFor(() => expect(mocks.archiveProcess).toHaveBeenCalledWith(74, ''));
        const notice = await screen.findByTestId('approval-queued-notice');
        expect(within(notice).getByRole('link')).toHaveAttribute('href', '/approvals?tab=mine&approvalId=502');
        expect(screen.getByTestId('location')).toHaveTextContent('/processes/74');
        expect(mocks.fetchProcess).toHaveBeenCalled();
    });
});
