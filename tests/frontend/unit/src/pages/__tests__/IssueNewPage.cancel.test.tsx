import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueNewPage } from '@/pages/IssueNewPage';
import { issuesApi } from '@/services/issuesApi';

const mockNavigate = vi.fn();
const mockListIssues = vi.mocked(issuesApi.list);

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

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        list: vi.fn(),
    },
}));

describe('IssueNewPage cancel', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
        mockListIssues.mockReset();
        mockListIssues.mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 1,
            capabilities: { can_create: true },
        });
    });

    it('navigates back to issues when cancel is clicked', async () => {
        render(<IssueNewPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'Cancel create' }));
        expect(mockNavigate).toHaveBeenCalledWith('/issues');
    });
});
