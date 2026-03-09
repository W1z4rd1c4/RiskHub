import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IssuesPage } from '@/pages/IssuesPage';

const mockList = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) =>
            resource === 'issues' && (action === 'read' || action === 'write'),
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
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams(''), vi.fn()] as const,
    };
});

const issues = [
    {
        id: 101,
        title: 'Multi-risk execution issue',
        severity: 'high',
        status: 'open',
        source_type: 'control_execution',
        source_id: 33,
        department_id: 7,
        department_name: 'Operations',
        owner_user_id: 9,
        owner_user_name: 'Eva Kralova',
        opened_at: '2026-01-02T09:00:00Z',
        due_at: null,
        closed_at: null,
        created_at: '2026-01-02T09:00:00Z',
        updated_at: '2026-01-02T09:00:00Z',
        risk_contexts: [
            {
                risk_id: 1,
                risk_name: 'Liquidity Risk',
                risk_category: 'Operational',
                risk_process: 'Treasury',
                risk_type: 'operational',
            },
            {
                risk_id: 2,
                risk_name: 'Reporting Risk',
                risk_category: 'Compliance',
                risk_process: 'Finance',
                risk_type: 'strategic',
            },
            {
                risk_id: 3,
                risk_name: 'Duplicate category risk',
                risk_category: 'Operational',
                risk_process: 'Treasury',
                risk_type: 'operational',
            },
        ],
        vendor_contexts: [
            {
                vendor_id: 91,
                vendor_name: 'Claims Cloud Platform',
            },
        ],
    },
    {
        id: 102,
        title: 'Manual issue without linked risk',
        severity: 'medium',
        status: 'open',
        source_type: 'manual',
        source_id: null,
        department_id: 8,
        department_name: 'IT',
        owner_user_id: null,
        owner_user_name: null,
        opened_at: '2026-01-03T09:00:00Z',
        due_at: null,
        closed_at: null,
        created_at: '2026-01-03T09:00:00Z',
        updated_at: '2026-01-03T09:00:00Z',
        risk_contexts: [],
        vendor_contexts: [],
    },
];

describe('IssuesPage grouped views', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockList.mockImplementation((params?: { skip?: number; limit?: number }) =>
            Promise.resolve({
                items: issues,
                total: issues.length,
                skip: params?.skip ?? 0,
                limit: params?.limit ?? 10,
            })
        );
    });

    it('keeps the default all view paginated and switches grouped views to drill-down cards', async () => {
        const ui = userEvent.setup();
        render(<IssuesPage />);

        await screen.findByText('Multi-risk execution issue');
        expect(document.body).toHaveTextContent(/Showing/);

        await ui.click(screen.getByRole('button', { name: 'By Category' }));

        await screen.findByRole('button', { name: /Operational/i });
        expect(screen.getByRole('button', { name: /Compliance/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Uncategorized/i })).toBeInTheDocument();
        expect(document.body).not.toHaveTextContent(/Showing/);
    });

    it('duplicates issues across distinct grouped buckets and keeps fallback buckets for unlinked issues', async () => {
        const ui = userEvent.setup();
        render(<IssuesPage />);

        await screen.findByText('Multi-risk execution issue');

        await ui.click(screen.getByRole('button', { name: 'By Category' }));
        await ui.click(await screen.findByRole('button', { name: /Operational/i }));

        await waitFor(() => {
            expect(screen.getAllByText('Multi-risk execution issue')).toHaveLength(1);
        });

        await ui.click(screen.getByRole('button', { name: 'Back' }));
        await ui.click(screen.getByRole('button', { name: /Compliance/i }));
        expect(await screen.findByText('Multi-risk execution issue')).toBeInTheDocument();

        await ui.click(screen.getByRole('button', { name: 'Back' }));
        await ui.click(screen.getByRole('button', { name: /Uncategorized/i }));
        expect(await screen.findByText('Manual issue without linked risk')).toBeInTheDocument();
    });

    it('groups by department even when no linked risk context exists', async () => {
        const ui = userEvent.setup();
        render(<IssuesPage />);

        await screen.findByText('Multi-risk execution issue');

        await ui.click(screen.getByRole('button', { name: 'By Department' }));
        await waitFor(() => {
            expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, limit: 100 }));
        });
        const itCard = screen
            .getAllByRole('button')
            .find((button) => button.textContent?.includes('IT') && button.textContent?.includes('Items'));
        expect(itCard).toBeDefined();
        await ui.click(itCard as HTMLButtonElement);

        expect(await screen.findByText('Manual issue without linked risk')).toBeInTheDocument();
        expect(screen.queryByText('Multi-risk execution issue')).not.toBeInTheDocument();
    });
});
