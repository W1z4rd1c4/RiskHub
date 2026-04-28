import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { AuditTrailPage } from '@/pages/AuditTrailPage';

const getExecutionsMock = vi.fn();
const downloadAuditTrailCsvMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (
            typeof options?.count === 'number' ? `${key}:${options.count}` : key
        ),
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/executionApi', () => ({
    executionApi: {
        getExecutions: (...args: unknown[]) => getExecutionsMock(...args),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        downloadAuditTrailCsv: (...args: unknown[]) => downloadAuditTrailCsvMock(...args),
    },
}));

describe('AuditTrailPage execution status rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        downloadAuditTrailCsvMock.mockResolvedValue(undefined);
    });

    it('renders audit results from the paginated execution response and uses canonical result labels', async () => {
        getExecutionsMock.mockResolvedValue({
            items: [
                {
                    id: 41,
                    control_id: 9,
                    executed_by_id: 2,
                    executed_at: '2026-03-07T10:00:00Z',
                    result: 'warning',
                    findings: 'Follow-up required',
                    created_at: '2026-03-07T10:00:00Z',
                    control_name: 'Quarterly Review Control',
                    executed_by_name: 'Anna Kowalski',
                    control_owner_name: 'Martin Prochazka',
                    linked_risks: ['Access Governance'],
                },
            ],
            total: 75,
            skip: 0,
            limit: 50,
            capabilities: {
                can_export_csv: true,
            },
        });

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('Quarterly Review Control');
        expect(getExecutionsMock).toHaveBeenCalledWith({
            skip: 0,
            limit: 50,
            result: undefined,
        });
        expect(screen.getByText('audit_trail.total_records:75')).toBeInTheDocument();
        expect(screen.getByText('controls:executions.issues_found')).toBeInTheDocument();
        expect(screen.getByText('Access Governance')).toBeInTheDocument();
    });

    it('shows the CSV action only when execution list capabilities allow export', async () => {
        getExecutionsMock.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: {
                can_export_csv: true,
            },
        });

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('audit_trail.total_records:0');
        await userEvent.click(screen.getByRole('button', { name: 'CSV' }));

        await waitFor(() => {
            expect(downloadAuditTrailCsvMock).toHaveBeenCalledWith({ result: undefined });
        });
    });

    it.each([
        ['false capability', { can_export_csv: false }],
        ['missing capabilities', undefined],
    ])('hides the CSV action when %s is returned', async (_caseName, capabilities) => {
        getExecutionsMock.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities,
        });

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('audit_trail.total_records:0');
        expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
    });
});
