import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import type { Risk, RiskControlLink } from '@/types/risk';
import type { Vendor } from '@/types/vendor';

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
    capabilities: {
        can_create_kri: true,
        can_create_linked_control: true,
        can_link_controls: true,
        can_unlink_controls: true,
    },
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

const linkedControlsFixture: RiskControlLink[] = [
    {
        id: 701,
        control_id: 11,
        risk_id: 19,
        effectiveness: 'high',
        created_at: '2026-01-01T00:00:00Z',
        control: {
            id: 11,
            name: 'Quarterly access review',
            frequency: 'monthly',
            risk_level: 2,
            status: 'active',
        },
    },
    {
        id: 702,
        control_id: 12,
        risk_id: 19,
        effectiveness: 'medium',
        created_at: '2026-01-01T00:00:00Z',
        control: {
            id: 12,
            name: 'Draft control',
            frequency: 'quarterly',
            risk_level: 2,
            status: 'draft',
        },
    },
    {
        id: 703,
        control_id: 13,
        risk_id: 19,
        effectiveness: 'low',
        created_at: '2026-01-01T00:00:00Z',
        control: {
            id: 13,
            name: 'Archived control',
            frequency: 'annually',
            risk_level: 1,
            status: 'archived',
        },
    },
];

const linkedVendorsFixture: Vendor[] = [
    {
        id: 901,
        name: 'Vendor One',
        process: 'Compliance',
        outsourcing_owner_user_id: 11,
        vendor_type: 'ict',
        risk_score_1_5: 4,
        supports_important_core_insurance_function: true,
        dora_relevant: true,
        is_significant_vendor: false,
        has_alternative_providers: true,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
    },
    {
        id: 902,
        name: 'Vendor Two',
        process: 'Compliance',
        outsourcing_owner_user_id: 12,
        vendor_type: 'partner',
        risk_score_1_5: 3,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        has_alternative_providers: true,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
    },
    {
        id: 903,
        name: 'Vendor Three',
        process: 'Compliance',
        outsourcing_owner_user_id: 13,
        vendor_type: 'other',
        risk_score_1_5: 2,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        has_alternative_providers: true,
        status: 'inactive',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
    },
];

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

    it('renders the Connections card with linked item counts', () => {
        renderSubject({
            risk: {
                ...riskWithKri,
                kris: [
                    ...riskWithKri.kris!,
                    {
                        ...riskWithKri.kris![0],
                        id: 502,
                        metric_name: 'Control Exceptions',
                    },
                ],
            },
            linkedControls: linkedControlsFixture,
            linkedVendors: linkedVendorsFixture,
        });

        const card = screen.getByRole('heading', { name: 'Connections' }).closest('.glass-card');
        expect(card).not.toBeNull();

        const scoped = within(card as HTMLElement);
        expect(scoped.getByText('Mitigating Controls')).toBeInTheDocument();
        expect(scoped.getByText('Risk Appetite Indicators')).toBeInTheDocument();
        expect(scoped.getByText('Linked Vendors')).toBeInTheDocument();
        expect(scoped.getByText('1')).toBeInTheDocument();
        expect(scoped.getByText('2')).toBeInTheDocument();
        expect(scoped.getByText('3')).toBeInTheDocument();
    });

    it('renders zero counts in the Connections card when no items are linked', () => {
        renderSubject({
            risk: {
                ...riskWithKri,
                kris: [],
            },
            linkedControls: [],
            linkedVendors: [],
        });

        const card = screen.getByRole('heading', { name: 'Connections' }).closest('.glass-card');
        expect(card).not.toBeNull();

        const zeroCounts = within(card as HTMLElement).getAllByText('0');
        expect(zeroCounts).toHaveLength(3);
    });
});
