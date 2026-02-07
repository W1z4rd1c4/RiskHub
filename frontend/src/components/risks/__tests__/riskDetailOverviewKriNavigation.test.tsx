import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import type { Risk } from '@/types/risk';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/components/PermissionGate', () => ({
    PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/RiskScoreMatrix', () => ({
    RiskScoreMatrix: () => <div>Risk score matrix</div>,
}));

vi.mock('@/components/LinkManagementDialog', () => ({
    LinkManagementDialog: () => null,
}));

vi.mock('@/components/ControlCreateDialog', () => ({
    ControlCreateDialog: () => null,
}));

vi.mock('@/components/controls/ControlGaugeCard', () => ({
    ControlGaugeCard: () => null,
}));

vi.mock('@/components/kri/KRIGaugeCard', () => ({
    KRIGaugeCard: ({ kri, onClick }: { kri: { metric_name: string }; onClick?: () => void }) => (
        <button onClick={onClick}>{kri.metric_name}</button>
    ),
}));

const riskWithKri: Risk = {
    id: 19,
    risk_id_code: 'R-019',
    name: 'Third-party compliance risk',
    process: 'Compliance',
    risk_type: 'operational',
    category: 'General',
    description: 'Example risk',
    gross_probability: 3,
    gross_impact: 3,
    gross_score: 9,
    net_probability: 2,
    net_impact: 2,
    net_score: 4,
    status: 'active',
    is_priority: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    kris: [
        {
            id: 501,
            risk_id: 19,
            metric_name: 'Audit Findings',
            description: 'Findings count',
            current_value: 3,
            lower_limit: 0,
            upper_limit: 10,
            unit: '%',
            breach_status: 'within',
            last_updated: '2026-01-02T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            frequency: 'monthly',
        },
    ],
};

describe('RiskDetailOverviewTab KRI navigation', () => {
    const renderSubject = (overrides?: Partial<ComponentProps<typeof RiskDetailOverviewTab>>) => {
        const onNavigateToNewKri = vi.fn();
        const onNavigateToKri = vi.fn();

        render(
            <RiskDetailOverviewTab
                risk={riskWithKri}
                linkedControls={[]}
                linkedVendors={[]}
                overdueKRIs={[]}
                getColor={() => '#334155'}
                getDisplayName={() => 'Operational'}
                onNavigateToNewKri={onNavigateToNewKri}
                onNavigateToKri={onNavigateToKri}
                onLinkControl={vi.fn(async () => undefined)}
                onUnlinkControl={vi.fn(async () => undefined)}
                onOpenCreateControl={vi.fn()}
                onNavigateToControl={vi.fn()}
                onNavigateToVendor={vi.fn()}
                onRefreshData={vi.fn()}
                isLinkDialogOpen={false}
                setIsLinkDialogOpen={vi.fn()}
                dialogMode="both"
                setDialogMode={vi.fn()}
                isCreateDialogOpen={false}
                setIsCreateDialogOpen={vi.fn()}
                {...overrides}
            />
        );

        return { onNavigateToNewKri, onNavigateToKri };
    };

    it('triggers onNavigateToNewKri when Add KRI is clicked', () => {
        const { onNavigateToNewKri } = renderSubject();

        fireEvent.click(screen.getByRole('button', { name: /add kri/i }));

        expect(onNavigateToNewKri).toHaveBeenCalledTimes(1);
    });

    it('triggers onNavigateToKri with KRI id when KRI card is clicked', () => {
        const { onNavigateToKri } = renderSubject();

        fireEvent.click(screen.getByRole('button', { name: 'Audit Findings' }));

        expect(onNavigateToKri).toHaveBeenCalledTimes(1);
        expect(onNavigateToKri).toHaveBeenCalledWith(501);
    });
});
