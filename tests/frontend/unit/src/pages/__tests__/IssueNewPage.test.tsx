import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IssueNewPage } from '@/pages/IssueNewPage';

const mockNavigate = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => resource === 'issues' && action === 'write',
    }),
}));

vi.mock('@/components/issues/IssueCreateForm', () => ({
    IssueCreateForm: ({ onCreated }: { onCreated: (issue: { id: number }) => void; onCancel?: () => void }) => (
        <button type="button" onClick={() => onCreated({ id: 17 })}>
            Submit issue
        </button>
    ),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('IssueNewPage', () => {
    it('navigates to issue detail after successful create', () => {
        render(<IssueNewPage />);

        expect(screen.getByText('Create Issue')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Submit issue' }));
        expect(mockNavigate).toHaveBeenCalledWith('/issues/17');
    });
});
