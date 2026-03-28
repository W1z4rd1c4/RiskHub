import { render, screen } from '@testing-library/react';
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
});
