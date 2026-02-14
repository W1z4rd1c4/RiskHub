import { fireEvent, render, screen } from '@testing-library/react';
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
                    department_id: 7,
                    department_name: 'Operations',
                    owner_user_id: 9,
                    owner_user_name: 'Eva Kralova',
                    opened_at: '2026-01-02T09:00:00Z',
                    due_at: null,
                    closed_at: null,
                    created_at: '2026-01-02T09:00:00Z',
                    updated_at: '2026-01-02T09:00:00Z',
                },
            ],
            total: 1,
            skip: 0,
            limit: 20,
        });
    });

    it('navigates to detail page on row click', async () => {
        render(<IssuesPage />);

        const rowTitle = await screen.findByText('Patch Vulnerability');
        fireEvent.click(rowTitle);

        expect(mockNavigate).toHaveBeenCalledWith('/issues/42');
    });
});
