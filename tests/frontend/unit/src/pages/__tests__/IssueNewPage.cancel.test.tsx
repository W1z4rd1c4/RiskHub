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
    IssueCreateForm: ({ onCancel }: { onCancel?: () => void }) => (
        <button type="button" onClick={() => onCancel?.()}>
            Cancel create
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

describe('IssueNewPage cancel', () => {
    it('navigates back to issues when cancel is clicked', () => {
        render(<IssueNewPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel create' }));
        expect(mockNavigate).toHaveBeenCalledWith('/issues');
    });
});
