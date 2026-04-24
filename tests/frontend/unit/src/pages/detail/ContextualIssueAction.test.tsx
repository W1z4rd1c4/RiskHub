import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';

vi.mock('@/components/PermissionGate', () => ({
    PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: ({
        contextEntityLabel,
        isOpen,
    }: {
        contextEntityLabel: string;
        isOpen: boolean;
    }) => (isOpen ? <div data-testid="issue-context">{contextEntityLabel}</div> : null),
}));

describe('ContextualIssueAction', () => {
    it('opens contextual issue modal with entity label', () => {
        const onOpen = vi.fn();

        render(
            <ContextualIssueAction
                buttonLabel="New Issue"
                contextEntityId={13}
                contextEntityLabel="Quarterly Access Review"
                contextEntityType="control"
                isOpen
                onClose={vi.fn()}
                onCreated={vi.fn()}
                onOpen={onOpen}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'New Issue' }));

        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('issue-context')).toHaveTextContent('Quarterly Access Review');
        expect(screen.queryByText('#13')).not.toBeInTheDocument();
    });
});
