import { fireEvent, screen } from '@testing-library/react';
import { renderInRouter as render } from '@test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueNewPage } from '@/pages/IssueNewPage';
import { issuesApi } from '@/services/issuesApi';

const mockNavigate = vi.fn();
const mockListIssues = vi.mocked(issuesApi.list);


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
        useSearchParams: () => [new URLSearchParams()],
    };
});

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        list: vi.fn(),
    },
}));

function issueListCapabilities(canCreate?: boolean) {
    return {
        items: [],
        total: 0,
        offset: 0,
        limit: 1,
        capabilities: typeof canCreate === 'boolean' ? { can_create: canCreate } : null,
    };
}

describe('IssueNewPage', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
        mockListIssues.mockReset();
        mockListIssues.mockResolvedValue(issueListCapabilities(true));
    });

    it('navigates to issue detail after successful create', async () => {
        render(<IssueNewPage />);

        expect(await screen.findByRole('heading', { level: 1, name: 'Create Issue' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Submit issue' }));
        expect(mockNavigate).toHaveBeenCalledWith('/issues/17?return_to=%2Fissues');
    });

    it('hides create form when backend capability denies issue creation', async () => {
        mockListIssues.mockResolvedValue(issueListCapabilities(false));

        render(<IssueNewPage />);

        expect(await screen.findByText('You do not have permission to create issues.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Submit issue' })).not.toBeInTheDocument();
    });

    it('hides create form when backend capability metadata is missing', async () => {
        mockListIssues.mockResolvedValue(issueListCapabilities());

        render(<IssueNewPage />);

        expect(await screen.findByText('You do not have permission to create issues.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Submit issue' })).not.toBeInTheDocument();
    });

    it('shows a retryable error, not a denial, when capability loading fails (PG-14)', async () => {
        mockListIssues.mockRejectedValueOnce(new Error('network unavailable'));

        render(<IssueNewPage />);

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('You do not have permission to create issues.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Submit issue' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByRole('button', { name: 'Submit issue' })).toBeInTheDocument();
        expect(mockListIssues).toHaveBeenCalledTimes(2);
    });
});
