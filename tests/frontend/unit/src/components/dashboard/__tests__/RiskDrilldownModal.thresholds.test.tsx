import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RiskDrilldownModal } from '@/components/dashboard/RiskDrilldownModal';
import { dashboardApi } from '@/services/dashboardApi';

const mockNavigate = vi.fn();

vi.mock('@/contexts/DashboardFilterContext', () => ({
    useDashboardFilters: () => ({
        filters: {
            departmentId: null,
            riskLevel: 'all',
            controlStatus: null,
            controlForm: null,
        },
    }),
    useDashboardFilterSelector: (
        selector: (state: {
            filters: {
                departmentId: number | null;
                riskLevel: 'all';
                controlStatus: string | null;
                controlForm: string | null;
            };
        }) => unknown,
    ) => selector({
        filters: {
            departmentId: null,
            riskLevel: 'all',
            controlStatus: null,
            controlForm: null,
        },
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({
        thresholds: { critical: 20, high: 12, medium: 6 },
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/services/dashboardApi', () => ({
    dashboardApi: {
        fetchRisksByCell: vi.fn(),
    },
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

describe('RiskDrilldownModal risk thresholds', () => {
    it('uses configured thresholds for listed risk score colors', async () => {
        vi.mocked(dashboardApi.fetchRisksByCell).mockResolvedValue([
            {
                id: 7,
                risk_id_code: 'R-THRESHOLD',
                name: 'Threshold Risk',
                description: 'Uses configured threshold color',
                net_score: 15,
                department_name: 'Risk',
                owner_name: 'Ava Owner',
            },
        ]);

        render(
            <RiskDrilldownModal
                isOpen
                onClose={vi.fn()}
                probability={4}
                impact={4}
                riskType="net"
            />,
        );

        expect(await screen.findByText('Threshold Risk')).toBeInTheDocument();
        const score = screen.getByText('Score: 15');
        expect(score).toHaveClass('text-orange-400');
        expect(score).not.toHaveClass('text-rose-400');
    });
});
