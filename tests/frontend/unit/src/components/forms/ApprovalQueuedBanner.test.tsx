import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';

describe('ApprovalQueuedBanner', () => {
    it('renders approval message, link, and close action', () => {
        const onClose = vi.fn();

        render(
            <MemoryRouter>
                <ApprovalQueuedBanner
                    closeLabel="Close"
                    message="Queued for approval"
                    onClose={onClose}
                    title="Approval submitted"
                    viewApprovalsLabel="View Approvals"
                />
            </MemoryRouter>
        );

        expect(screen.getByText('Approval submitted')).toBeInTheDocument();
        expect(screen.getByText('Queued for approval')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /view approvals/i })).toHaveAttribute('href', '/approvals');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('announces an inserted banner once without moving focus from the initiating control', async () => {
        const user = userEvent.setup();

        function BannerHarness() {
            const [isVisible, setIsVisible] = useState(false);

            return (
                <>
                    <button type="button" onClick={() => setIsVisible(true)}>
                        Submit for approval
                    </button>
                    {isVisible ? (
                        <ApprovalQueuedBanner
                            closeLabel="Close"
                            message="Queued for approval"
                            onClose={() => setIsVisible(false)}
                            title="Approval submitted"
                            viewApprovalsLabel="View Approvals"
                        />
                    ) : null}
                </>
            );
        }

        render(
            <MemoryRouter>
                <BannerHarness />
            </MemoryRouter>,
        );

        const submitButton = screen.getByRole('button', { name: 'Submit for approval' });
        await user.click(submitButton);

        expect(submitButton).toHaveFocus();
        expect(screen.getAllByRole('status')).toHaveLength(1);
    });
});
