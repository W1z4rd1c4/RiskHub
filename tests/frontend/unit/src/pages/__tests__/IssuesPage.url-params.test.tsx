import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesPage } from '@/pages/IssuesPage';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';

const mockList = vi.fn();
const mockExportIssues = vi.fn();
const mockNavigate = vi.fn();
const setSearchParams = vi.fn();
let mockQueryString = '';

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
        exportIssues: (...args: unknown[]) => mockExportIssues(...args),
    },
}));

vi.mock('@/components/reports/ExportDialog', () => ({
    ExportDialog: ({
        isOpen,
        onSubmit,
    }: {
        isOpen: boolean;
        onSubmit: (payload: { format: 'csv'; asOfDate: string }) => Promise<void>;
    }) =>
        isOpen ? (
            <button type="button" onClick={() => void onSubmit({ format: 'csv', asOfDate: '2026-02-14' })}>
                confirm-export
            </button>
        ) : null,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams(mockQueryString), setSearchParams] as const,
    };
});

describe('IssuesPage URL filter initialization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQueryString = '';
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 20,
        });
        mockExportIssues.mockResolvedValue(undefined);
    });

    it('initializes supported filters from URL query params', async () => {
        mockQueryString = '?status=open&severity=critical&overdue=true&include_closed=true';

        render(<IssuesPage />);

        await waitFor(() => {
            expect(mockList).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'open',
                    severity: 'critical',
                    overdue: true,
                    include_closed: true,
                })
            );
        });
    });

    it('ignores invalid URL query params safely', async () => {
        mockQueryString =
            '?status=invalid&severity=bad&severity_group=wrong&overdue=maybe&exclude_active_exceptions=whatever&include_closed=whatever&sort_by=hack&sort_order=nope';

        render(<IssuesPage />);

        await waitFor(() => {
            expect(mockList).toHaveBeenCalledWith({
                skip: 0,
                limit: DEFAULT_LIST_PAGE_SIZE,
                include_closed: false,
            });
        });
    });

    it('initializes high+critical severity group and actionable parity filter from URL', async () => {
        mockQueryString = '?severity_group=high_critical&include_closed=false&exclude_active_exceptions=true';

        render(<IssuesPage />);

        await waitFor(() => {
            expect(mockList).toHaveBeenCalledWith(
                expect.objectContaining({
                    include_closed: false,
                    severity_group: 'high_critical',
                    exclude_active_exceptions: true,
                })
            );
        });

        const latestFilters = mockList.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(latestFilters).not.toHaveProperty('status');
        expect(latestFilters).not.toHaveProperty('severity');
    });

    it('forwards severity_group and actionable filter to export API payload', async () => {
        mockQueryString = '?severity_group=high_critical&include_closed=false&exclude_active_exceptions=true';

        render(<IssuesPage />);

        await waitFor(() => {
            expect(mockList).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        fireEvent.click(screen.getByRole('button', { name: 'confirm-export' }));

        await waitFor(() => {
            expect(mockExportIssues).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: 'csv',
                    asOfDate: '2026-02-14',
                    filters: expect.objectContaining({
                        status: null,
                        severity: null,
                        severityGroup: 'high_critical',
                        excludeActiveExceptions: true,
                    }),
                })
            );
        });
    });
});
