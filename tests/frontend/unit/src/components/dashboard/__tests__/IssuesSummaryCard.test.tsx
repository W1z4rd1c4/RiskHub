import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IssuesSummaryCard } from '@/components/dashboard/IssuesSummaryCard';

const mockNavigate = vi.fn();

const translations: Record<string, string> = {
    'issues.summary.title': 'Issues Summary',
    'issues.summary.open': 'Open',
    'issues.summary.overdue': 'Overdue',
    'issues.summary.high_critical_open': 'High/Critical Open',
    'issues.summary.median_age_days': 'Median Age (days)',
    'issues.summary.aggregate_metric_hint': 'Aggregate metric (no direct filter)',
};

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] ?? key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('IssuesSummaryCard', () => {
    it('keeps high/critical and core rows clickable, while median age remains informational', () => {
        render(
            <IssuesSummaryCard
                issueSummary={{
                    open_issues: 20,
                    overdue_issues: 8,
                    high_severity_open: 4,
                    median_days_open: 11,
                }}
            />
        );

        const openButton = screen.getByRole('button', { name: 'Open: 20' });
        const overdueButton = screen.getByRole('button', { name: 'Overdue: 8' });
        const highCriticalButton = screen.getByRole('button', { name: 'High/Critical Open: 4' });

        expect(openButton).toHaveAttribute('type', 'button');
        expect(overdueButton).toHaveAttribute('type', 'button');
        expect(highCriticalButton).toHaveAttribute('type', 'button');
        expect(screen.queryByRole('button', { name: 'Median Age (days): 11' })).not.toBeInTheDocument();
        expect(screen.getAllByText('Aggregate metric (no direct filter)')).toHaveLength(1);

        fireEvent.click(openButton);
        fireEvent.click(overdueButton);
        fireEvent.click(highCriticalButton);

        expect(mockNavigate).toHaveBeenNthCalledWith(1, '/issues?include_closed=false&exclude_active_exceptions=true');
        expect(mockNavigate).toHaveBeenNthCalledWith(
            2,
            '/issues?include_closed=false&exclude_active_exceptions=true&overdue=true'
        );
        expect(mockNavigate).toHaveBeenNthCalledWith(
            3,
            '/issues?include_closed=false&exclude_active_exceptions=true&severity_group=high_critical'
        );
        expect(mockNavigate).toHaveBeenCalledTimes(3);
    });
});
