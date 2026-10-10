import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import * as axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import {
    approvalIdFromResponse,
    readApprovalQueuedState,
    useApprovalQueued,
    withoutApprovalQueuedState,
} from '@/hooks/useApprovalQueued';
import '@/i18n';

/** D12 / PM-2: the approval-queued rule — entity page + persistent notice + success toast. */

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function Announcer({ to, approvalId }: { to?: string; approvalId?: number | null }) {
    const announce = useApprovalQueued();
    return (
        <button type="button" onClick={() => announce({ approvalId, to })}>
            submit
        </button>
    );
}

function EntityPage() {
    return (
        <>
            <ApprovalQueuedNotice />
            <LocationProbe />
        </>
    );
}

function renderFlow(announcer: ReactElement, initialEntry = '/risks/7/edit?return_to=%2Frisks') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <FeedbackProvider>
                <Routes>
                    <Route path="/risks/7/edit" element={announcer} />
                    <Route path="/risks/7" element={<><EntityPage />{announcer}</>} />
                    <Route path="/approvals" element={<LocationProbe />} />
                </Routes>
            </FeedbackProvider>
        </MemoryRouter>,
    );
}

describe('useApprovalQueued + ApprovalQueuedNotice', () => {
    it('returns to the entity page with a persistent notice linking to the request and a success toast', async () => {
        renderFlow(<Announcer to="/risks/7" approvalId={41} />);

        fireEvent.click(screen.getByRole('button', { name: 'submit' }));

        expect(screen.getByTestId('location')).toHaveTextContent('/risks/7');
        const notice = screen.getByTestId('approval-queued-notice');
        expect(notice).toHaveTextContent('Pending approval');
        // The toast announces the outcome; the notice is a static page note.
        expect(notice).not.toHaveAttribute('role');
        const link = within(notice).getByRole('link', { name: /open in approvals/i });
        expect(link).toHaveAttribute('href', '/approvals?tab=mine&approvalId=41');

        const toast = (await screen.findByText('Submitted for approval')).closest('li');
        expect(toast).toHaveAttribute('data-tone', 'success');

        const results = await axe.run(notice, { rules: { 'color-contrast': { enabled: false } } });
        expect(results.violations).toEqual([]);
    });

    it('stays on the current page when no target is given and the notice can be dismissed', async () => {
        renderFlow(<Announcer approvalId={null} />, '/risks/7');
        expect(screen.queryByTestId('approval-queued-notice')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'submit' }));

        expect(screen.getByTestId('location')).toHaveTextContent('/risks/7');
        const notice = screen.getByTestId('approval-queued-notice');
        expect(within(notice).getByRole('link', { name: /open in approvals/i })).toHaveAttribute('href', '/approvals');

        await act(async () => {
            fireEvent.click(within(notice).getByRole('button', { name: 'Dismiss message' }));
        });
        expect(screen.queryByTestId('approval-queued-notice')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/risks/7');
    });

    it('reads, validates and strips the router-state contract', () => {
        expect(readApprovalQueuedState(null)).toBeNull();
        expect(readApprovalQueuedState({ approvalQueued: { approvalId: 5 } })).toEqual({ approvalId: 5 });
        expect(readApprovalQueuedState({ approvalQueued: { approvalId: -1 } })).toEqual({ approvalId: null });
        expect(withoutApprovalQueuedState({ approvalQueued: { approvalId: 5 }, other: 1 })).toEqual({ other: 1 });
        expect(withoutApprovalQueuedState({ approvalQueued: { approvalId: 5 } })).toBeNull();
        expect(approvalIdFromResponse({ status: 'approval_required', approval_id: 12 })).toBe(12);
        expect(approvalIdFromResponse(undefined)).toBeNull();
    });
});
