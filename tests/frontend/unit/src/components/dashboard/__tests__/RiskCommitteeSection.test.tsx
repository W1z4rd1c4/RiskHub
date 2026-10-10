import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskCommitteeSection } from '@/components/dashboard/RiskCommitteeSection';
import { dashboardApi, type DashboardCommitteeSummary } from '@/services/dashboardApi';

vi.mock('@/i18n/hooks', async () => {
    const { formatRelativeDateValue } = await vi.importActual<typeof import('@/i18n/formatters')>('@/i18n/formatters');
    return {
        useFormat: () => ({ relative: (value: string) => formatRelativeDateValue(value, 'en') }),
        useTranslation: () => ({
            t: (key: string, options?: { count?: number; shown?: number; total?: number } | string) => {
                if (key === 'risk_committee.top_of_total' && typeof options === 'object') {
                    return `Top ${options.shown} of ${options.total}`;
                }
                if (key === 'sections.risk_exposure_by_dept') return 'Sum of net Risk scores';
                if (key === 'risk_committee.risk_count' && typeof options === 'object') {
                    return `${options.count} Risks`;
                }
                return key;
            },
        }),
    };
});

vi.mock('@/components/dashboard/QuarterlyComparisonWidget', () => ({
    QuarterlyComparisonWidget: () => <div>quarterly comparison</div>,
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({
        thresholds: { critical: 20, high: 12, medium: 6 },
    }),
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

vi.mock('@/services/dashboardApi', () => ({
    dashboardApi: {
        fetchCommitteeSummary: vi.fn(),
    },
}));

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderSection() {
    return render(
        <MemoryRouter>
            <RiskCommitteeSection />
            <LocationProbe />
        </MemoryRouter>,
    );
}

const emptySummary: DashboardCommitteeSummary = {
    critical_risks: [],
    critical_risks_total: 0,
    recent_activity: [],
    department_exposure: [],
    critical_vendors: [],
    critical_vendors_total: 0,
    can_view_vendors: true,
};

function populatedSummary(): DashboardCommitteeSummary {
    return {
        critical_risks: [{
            id: 1,
            risk_id_code: 'RISK-001',
            name: 'Solvency Stress',
            process: 'Capital Planning',
            description: 'Capital buffer can fall below appetite.',
            net_score: 16,
            is_priority: true,
            owner_name: 'Ava Owner',
            department_name: 'Risk',
        }],
        critical_risks_total: 6,
        critical_vendors: [{
            id: 42,
            name: 'Claims Cloud',
            process: 'Claims',
            subprocess: 'FNOL',
            risk_score_1_5: 4,
            supports_important_core_insurance_function: true,
            dora_relevant: true,
            is_significant_vendor: true,
            outsourcing_owner_name: 'Vera Vendor',
            department_name: 'Operations',
        }],
        critical_vendors_total: 7,
        can_view_vendors: true,
        department_exposure: [{
            id: 7,
            name: 'Operations',
            total_exposure: 18,
            risk_count: 3,
        }],
        recent_activity: [{
            id: 9,
            action: 'approve',
            entity_type: 'risk',
            entity_name: 'Risk approval',
            description: 'Approved a change',
            created_at: '2026-04-23T12:00:00Z',
        }],
    };
}

describe('RiskCommitteeSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('shows the quarterly widget while committee summary is loading', () => {
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockReturnValue(new Promise(() => undefined));

        renderSection();

        expect(screen.getByText('quarterly comparison')).toBeInTheDocument();
        expect(dashboardApi.fetchCommitteeSummary).toHaveBeenCalledTimes(1);
    });

    it('renders a committee summary load error without hiding quarterly comparison', async () => {
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockRejectedValue(new Error('boom'));

        renderSection();

        expect(await screen.findByText('errors.load_failed')).toBeInTheDocument();
        expect(screen.getByText('quarterly comparison')).toBeInTheDocument();
    });

    it('renders empty-state messages for each committee section', async () => {
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue(emptySummary);

        renderSection();

        expect(await screen.findByText('risk_committee.no_critical_risks')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.no_vendors_in_scope')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.no_department_exposure_data')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.no_recent_significant_activity')).toBeInTheDocument();
    });

    it('renders populated committee cards and navigates to the vendor schedule target', async () => {
        vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue(populatedSummary());

        renderSection();

        expect(await screen.findByText('Solvency Stress')).toBeInTheDocument();
        expect(screen.getByText('Capital Planning')).toBeInTheDocument();
        expect(screen.getByText('Ava Owner')).toBeInTheDocument();
        expect(screen.getByText('Claims Cloud')).toBeInTheDocument();
        expect(screen.getByText('4/5')).toBeInTheDocument();
        expect(screen.getByText('Top 1 of 6')).toBeInTheDocument();
        expect(screen.getByText('Top 1 of 7')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.high_risk_vendors')).toBeInTheDocument();
        expect(screen.getByText('Operations')).toBeInTheDocument();
        expect(screen.getByText('Sum of net Risk scores')).toBeInTheDocument();
        expect(screen.getByText('3 Risks')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Operations: 18; 3 Risks' })).toHaveAttribute('aria-valuenow', '18');
        expect(screen.queryByText(/Critical|High/)).not.toBeInTheDocument();
        expect(screen.getByText('Risk approval')).toBeInTheDocument();
        expect(screen.getByText('3 days ago')).toBeInTheDocument();

        // D1: severity-coloured scores carry their band label (configured thresholds 20/12/6).
        // Risk net score 16 and vendor rating 4/5 are both in the high band.
        expect(screen.getAllByText('risk_levels.high', { selector: '[data-severity="high"]' })).toHaveLength(2);

        expect(screen.getByRole('link', { name: 'risk_committee.view_all_critical_risks' })).toHaveAttribute(
            'href',
            '/risks?net_band=critical',
        );
        expect(screen.getByRole('link', { name: 'risk_committee.view_all_high_risk_vendors' })).toHaveAttribute(
            'href',
            '/vendors?risk_scores=4&risk_scores=5',
        );
        expect(screen.queryByRole('button')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('link', { name: /Claims Cloud/ }));

        expect(screen.getByTestId('location')).toHaveTextContent('/vendors/42?tab=assessments&section=schedule');
    });

    it('does not present a permission-hidden vendor population as zero', async () => {
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue({
            ...emptySummary,
            critical_vendors_total: null,
            can_view_vendors: false,
        });

        renderSection();

        expect(await screen.findByText('risk_committee.restricted_by_access_scope')).toBeInTheDocument();
        expect(screen.queryByText('risk_committee.no_vendors_in_scope')).not.toBeInTheDocument();
    });

    it('renders committee scores from configured data', async () => {
        const summary = populatedSummary();
        summary.critical_risks[0].net_score = 15;
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue(summary);

        renderSection();

        expect(await screen.findByText('Solvency Stress')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
    });
});
