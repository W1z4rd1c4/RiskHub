import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * AX-05 (audit 2026-09-30 §4.10): DetailActionBanner keeps its API and renders
 * `InlineMessage`, so failures are announced as alerts and a queued approval is
 * a polite status that links to the approvals queue.
 */

describe('DetailActionBanner', () => {
    it('announces a failed action as an alert on the danger tone', () => {
        renderWithoutProviders(
            <DetailActionBanner message={{ key: 'failed', isError: true }} messageText="Could not archive" onClose={vi.fn()} />,
        );
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Could not archive');
        expect(alert).toHaveClass('text-destructive');
        expect(alert.className).not.toMatch(/\b(?:rose|amber)-\d+/);
    });

    it('announces a queued approval politely with a working approvals link', async () => {
        const user = userEvent.setup();
        const onNavigateApprovals = vi.fn();
        renderWithoutProviders(
            <DetailActionBanner
                message={{ key: 'approval.queued' }}
                messageText="Change sent for approval"
                pendingText="View it in"
                approvalsLabel="Approvals"
                sectionSuffix="section"
                onClose={vi.fn()}
                onNavigateApprovals={onNavigateApprovals}
            />,
        );
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Change sent for approval');
        expect(status).toHaveTextContent('View it in Approvals section');
        expect(status).toHaveClass('text-warning-text');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Approvals' }));
        expect(onNavigateApprovals).toHaveBeenCalledTimes(1);
    });
});
