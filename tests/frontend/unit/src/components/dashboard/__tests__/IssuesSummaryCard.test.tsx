import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { IssuesSummaryCard } from '@/components/dashboard/IssuesSummaryCard';

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
    useFormat: () => ({ number: (value: number) => String(value) }),
}));

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderCard() {
    return render(
        <MemoryRouter>
            <IssuesSummaryCard
                issueSummary={{
                    open_issues: 20,
                    overdue_issues: 8,
                    high_severity_open: 4,
                    median_days_open: 11,
                }}
            />
            <LocationProbe />
        </MemoryRouter>,
    );
}

describe('IssuesSummaryCard', () => {
    it('renders the drill-down rows as named links, while median age remains informational', () => {
        renderCard();

        expect(screen.getByRole('heading', { level: 2, name: 'Issues Summary' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open: 20' })).toHaveAttribute(
            'href',
            '/issues?include_closed=false&exclude_active_exceptions=true',
        );
        expect(screen.getByRole('link', { name: 'Overdue: 8' })).toHaveAttribute(
            'href',
            '/issues?include_closed=false&exclude_active_exceptions=true&overdue=true',
        );
        expect(screen.getByRole('link', { name: 'High/Critical Open: 4' })).toHaveAttribute(
            'href',
            '/issues?include_closed=false&exclude_active_exceptions=true&severity_group=high_critical',
        );
        expect(screen.queryByRole('link', { name: /Median Age/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByTestId('issues-summary-median_age_days')).toHaveTextContent('Median Age (days)');
        expect(screen.getAllByText('Aggregate metric (no direct filter)')).toHaveLength(1);
    });

    it('navigates to the filtered issue register on activation', () => {
        renderCard();

        fireEvent.click(screen.getByRole('link', { name: 'Overdue: 8' }));

        expect(screen.getByTestId('location')).toHaveTextContent(
            '/issues?include_closed=false&exclude_active_exceptions=true&overdue=true',
        );
    });
});
