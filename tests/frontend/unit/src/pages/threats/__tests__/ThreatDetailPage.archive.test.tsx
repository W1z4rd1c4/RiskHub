import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackProvider } from '@/contexts/FeedbackContext';
import '@/i18n';
import type { Threat } from '@/types/threat';

/**
 * PG-07 / SM-04 / D10 / PM-1: the Threat archive is an `archive` intent
 * (Archive icon, no "Delete", no reason field because the Threat API takes
 * none); a failure stays inside the open dialog, success is a toast.
 */

const mocks = vi.hoisted(() => ({
    archiveThreat: vi.fn(),
    fetchThreat: vi.fn(),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: false }),
}));

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        archiveThreat: (...args: unknown[]) => mocks.archiveThreat(...args),
        getThreats: vi.fn().mockResolvedValue({ items: [] }),
    },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

const threat: Threat = {
    id: 73,
    name: 'Credential stuffing',
    threat_steward_user_id: 10,
    threat_steward: { name: 'Clara Security', email: 'clara@example.test', role_name: 'ciso' },
    steward_orphaned: false,
    stewardship_status: 'assigned',
    is_archived: false,
    capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
    created_at: '2026-07-15T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
} as Threat;

vi.mock('@/pages/threats/useThreatDetailState', () => ({
    useThreatDetailState: () => ({
        canArchive: true,
        canEdit: true,
        canRestore: false,
        fetchThreat: mocks.fetchThreat,
        isRetrying: false,
        loadOutcome: 'content',
        restoreThreat: vi.fn(),
        setThreat: vi.fn(),
        threat,
        threatId: 73,
    }),
}));

vi.mock('@/pages/threats/ThreatRiskLinksSection', () => ({
    ThreatRiskLinksSection: () => <div data-testid="threat-risk-links-section" />,
}));

import { ThreatDetailPage } from '@/pages/ThreatDetailPage';

function renderPage() {
    return render(
        <FeedbackProvider>
            <MemoryRouter initialEntries={['/threats/73']}>
                <Routes>
                    <Route path="/threats/:id" element={<ThreatDetailPage />} />
                    <Route path="/threats" element={<p>Threat register</p>} />
                </Routes>
            </MemoryRouter>
        </FeedbackProvider>,
    );
}

describe('ThreatDetailPage archive confirmation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('confirms with the archive intent and keeps a failure inside the open dialog', async () => {
        mocks.archiveThreat.mockRejectedValueOnce(new Error('offline'));
        renderPage();

        const archiveButton = await screen.findByTestId('threat-detail-archive');
        expect(archiveButton.querySelector('svg.lucide-archive')).not.toBeNull();
        expect(archiveButton.querySelector('svg.lucide-trash-2')).toBeNull();
        fireEvent.click(archiveButton);

        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByRole('heading', { name: 'Archive Threat?' })).toBeInTheDocument();
        expect(dialog.querySelector('svg.lucide-archive')).not.toBeNull();
        // PM-1: the Threat API takes no reason, so no reason field is offered.
        expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Archiving the threat failed. Please try again.');
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('returns to the register with a success toast after archiving', async () => {
        mocks.archiveThreat.mockResolvedValueOnce(undefined);
        renderPage();

        fireEvent.click(await screen.findByTestId('threat-detail-archive'));
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

        await waitFor(() => expect(mocks.archiveThreat).toHaveBeenCalledWith(73));
        expect(await screen.findByText('Threat register')).toBeInTheDocument();
        const toast = (await screen.findByText('Archived: Credential stuffing')).closest('li');
        expect(toast).toHaveAttribute('data-tone', 'success');
    });
});
