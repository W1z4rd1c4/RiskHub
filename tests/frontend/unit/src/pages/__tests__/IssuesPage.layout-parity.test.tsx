import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesPage } from '@/pages/IssuesPage';

const mockList = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => resource === 'issues' && (action === 'read' || action === 'write'),
    }),
}));

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
            skip: 0,
            limit: 20,
        });
    });

    it('renders Risks-style header actions and compact filter controls', async () => {
        const { container } = render(<IssuesPage />);

        await screen.findByText('Issues');

        expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New Issue' })).toBeInTheDocument();

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
});
