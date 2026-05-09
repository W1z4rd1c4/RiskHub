import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesPage } from '@/pages/IssuesPage';
import { ApiClientError } from '@/services/apiClient';

const mockList = vi.fn();


vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        list: (...args: unknown[]) => mockList(...args),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        exportIssues: vi.fn(),
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useSearchParams: () => [new URLSearchParams(''), vi.fn()] as const,
    };
});

describe('IssuesPage layout parity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            offset: 0,
            limit: 20,
            capabilities: {
                can_create: true,
                can_export: true,
            },
        });
    });

    it('renders Risks-style header actions and compact filter controls', async () => {
        const { container } = render(<IssuesPage />);

        await screen.findByText('Issues');

        expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New Issue' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Category' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Department' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Process' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Risk Type' })).toBeInTheDocument();

        const searchInput = screen.getByPlaceholderText('Search by title or description');
        expect(searchInput).toBeInTheDocument();
        expect(screen.getByText('All statuses')).toBeInTheDocument();
        expect(screen.getByText('All severities')).toBeInTheDocument();
        expect(screen.getByLabelText('Overdue only')).toBeInTheDocument();
        expect(screen.getByLabelText('Include closed')).toBeInTheDocument();
        expect(screen.getByTitle('Refresh')).toBeInTheDocument();

        const filterBar = searchInput.closest('.glass-card');
        expect(filterBar).not.toBeNull();
        expect(filterBar).toHaveClass('md:flex-row');
        expect(filterBar).toHaveClass('md:items-center');

        expect(container.textContent).not.toContain('Department ID');
        expect(container.textContent).not.toContain('Owner user ID');
    });

    it.each([
        ['false capability', { can_create: true, can_export: false }],
        ['missing capability', { can_create: true }],
        ['missing capabilities', undefined],
    ])('hides export when issue list returns %s', async (_caseName, capabilities) => {
        mockList.mockResolvedValueOnce({
            items: [],
            total: 0,
            offset: 0,
            limit: 20,
            capabilities,
        });

        render(<IssuesPage />);

        await screen.findByText('Issues');
        expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    });

    it('loads issues from backend without local session permission gates', async () => {
        render(<IssuesPage />);

        await screen.findByText('Issues');
        expect(mockList).toHaveBeenCalled();
        expect(screen.queryByText('You do not have permission to view issues.')).not.toBeInTheDocument();
    });

    it('renders view denied when backend issue list returns forbidden', async () => {
        mockList.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(<IssuesPage />);

        await screen.findByText('You do not have permission to view issues.');
        expect(screen.queryByText('Issues')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });
});
