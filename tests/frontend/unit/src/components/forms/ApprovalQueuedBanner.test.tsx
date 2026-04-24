import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

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
});
