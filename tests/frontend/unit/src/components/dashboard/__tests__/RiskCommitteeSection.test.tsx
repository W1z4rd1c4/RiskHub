import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskCommitteeSection } from '@/components/dashboard/RiskCommitteeSection';
import { dashboardApi, type DashboardCommitteeSummary } from '@/services/dashboardApi';

const mockNavigate = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number } | string) => {
            if (key === 'risk_committee.days_ago' && typeof options === 'object') {
                return `${options.count} days ago`;
            }
            return key;
        },
    }),
}));

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

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const emptySummary: DashboardCommitteeSummary = {
    critical_risks: [],
    recent_activity: [],
    department_exposure: [],
    critical_vendors: [],
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

        render(<RiskCommitteeSection />);

        expect(screen.getByText('quarterly comparison')).toBeInTheDocument();
        expect(dashboardApi.fetchCommitteeSummary).toHaveBeenCalledTimes(1);
    });

    it('renders a committee summary load error without hiding quarterly comparison', async () => {
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockRejectedValue(new Error('boom'));

        render(<RiskCommitteeSection />);

        expect(await screen.findByText('errors.load_failed')).toBeInTheDocument();
        expect(screen.getByText('quarterly comparison')).toBeInTheDocument();
    });

    it('renders empty-state messages for each committee section', async () => {
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue(emptySummary);

        render(<RiskCommitteeSection />);

        expect(await screen.findByText('risk_committee.no_critical_risks')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.no_vendors_in_scope')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.no_department_exposure_data')).toBeInTheDocument();
        expect(screen.getByText('risk_committee.no_recent_significant_activity')).toBeInTheDocument();
    });

    it('renders populated committee cards and navigates to the vendor schedule target', async () => {
        vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue(populatedSummary());

        render(<RiskCommitteeSection />);

        expect(await screen.findByText('Solvency Stress')).toBeInTheDocument();
        expect(screen.getByText('Capital Planning')).toBeInTheDocument();
        expect(screen.getByText('Ava Owner')).toBeInTheDocument();
        expect(screen.getByText('Claims Cloud')).toBeInTheDocument();
        expect(screen.getByText('4/5')).toBeInTheDocument();
        expect(screen.getByText('Operations')).toBeInTheDocument();
        expect(screen.getByText('Risk approval')).toBeInTheDocument();
        expect(screen.getByText('3 days ago')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Claims Cloud/ }));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/vendors/42?tab=assessments&section=schedule');
        });
    });

    it('uses configured risk thresholds for committee risk score coloring', async () => {
        const summary = populatedSummary();
        summary.critical_risks[0].net_score = 15;
        vi.mocked(dashboardApi.fetchCommitteeSummary).mockResolvedValue(summary);

        render(<RiskCommitteeSection />);

        expect(await screen.findByText('Solvency Stress')).toBeInTheDocument();
        const score = screen.getByText('15');
        expect(score).toHaveClass('text-orange-400');
        expect(score).not.toHaveClass('text-rose-400');
    });
});
