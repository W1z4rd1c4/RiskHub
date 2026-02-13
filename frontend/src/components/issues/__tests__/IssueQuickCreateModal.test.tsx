import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';

const createContextualMock = vi.fn();

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        createContextual: (...args: unknown[]) => createContextualMock(...args),
    },
}));

describe('IssueQuickCreateModal', () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    beforeEach(() => {
        createContextualMock.mockReset();
        onClose.mockReset();
        onCreated.mockReset();
    });

    it('renders context label without exposing raw numeric ids', () => {
        render(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="risk"
                contextEntityId={123}
                contextEntityLabel="Claims Settlement Risk"
            />
        );

        expect(screen.getByText('Claims Settlement Risk')).toBeInTheDocument();
        expect(screen.queryByText('#123')).not.toBeInTheDocument();
        expect(screen.queryByText(/ID\s*123/i)).not.toBeInTheDocument();
    });

    it('submits contextual payload and calls onCreated', async () => {
        createContextualMock.mockResolvedValueOnce({ id: 77, title: 'Issue from control' });

        render(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="control"
                contextEntityId={45}
                contextEntityLabel="Wire Transfer Reconciliation"
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Issue title'), { target: { value: 'Control finding issue' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Issue' }));

        await waitFor(() => {
            expect(createContextualMock).toHaveBeenCalledTimes(1);
        });
        expect(createContextualMock.mock.calls[0]?.[0]).toMatchObject({
            entity_type: 'control',
            entity_id: 45,
            title: 'Control finding issue',
            severity: 'medium',
        });
        expect(onCreated).toHaveBeenCalledWith({ id: 77, title: 'Issue from control' });
        expect(onClose).toHaveBeenCalled();
    });

    it('shows backend error on create failure', async () => {
        createContextualMock.mockRejectedValueOnce(new Error('Context source not found'));

        render(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="vendor"
                contextEntityId={55}
                contextEntityLabel="Cloud Hosting Partner"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Create Issue' }));

        expect(await screen.findByText('Context source not found')).toBeInTheDocument();
        expect(onCreated).not.toHaveBeenCalled();
    });
});
