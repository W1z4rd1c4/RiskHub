import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesPage } from '@/pages/IssuesPage';

const mockList = vi.fn();
const mockNavigate = vi.fn();

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
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams(''), vi.fn()] as const,
    };
});

describe('IssuesPage table navigation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockList.mockResolvedValue({
            items: [
                {
                    id: 42,
                    title: 'Patch Vulnerability',
                    severity: 'high',
                    status: 'open',
                    source_type: 'manual',
                    source_id: null,
                    source_display: 'Control Evidence Review',
                    source_link: null,
                    department_id: 7,
                    department_name: 'Operations',
                    owner_user_id: 9,
                    owner_user_name: 'Eva Kralova',
                    opened_at: '2026-01-02T09:00:00Z',
                    due_at: null,
                    closed_at: null,
                    created_at: '2026-01-02T09:00:00Z',
                    updated_at: '2026-01-02T09:00:00Z',
                    risk_contexts: [],
                },
            ],
            total: 1,
            offset: 0,
            limit: 20,
        });
    });

    it('navigates to detail page on row click', async () => {
        render(<IssuesPage />);

        const rowTitle = await screen.findByText('Patch Vulnerability');
        expect(await screen.findByText('Control Evidence Review')).toBeInTheDocument();
        fireEvent.click(rowTitle);

        expect(mockNavigate).toHaveBeenCalledWith('/issues/42');
    });

    it('does not emit unsupported server sort keys for display-only columns', async () => {
        render(<IssuesPage />);

        await screen.findByText('Patch Vulnerability');
        mockList.mockClear();

        fireEvent.click(screen.getByText('Department'));
        fireEvent.click(screen.getByText('Owner'));
        fireEvent.click(screen.getByText('Source'));

        expect(mockList).not.toHaveBeenCalled();
    });

    it('emits supported server sort keys for sortable columns', async () => {
        render(<IssuesPage />);

        await screen.findByText('Patch Vulnerability');
        mockList.mockClear();

        fireEvent.click(screen.getByText('Issue'));

        await waitFor(() => {
            expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ sort_by: 'title', sort_order: 'asc' }));
        });
    });
});
