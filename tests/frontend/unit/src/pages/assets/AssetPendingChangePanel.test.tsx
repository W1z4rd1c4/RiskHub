import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { requester?: string; defaultValue?: string }) => (
            options?.requester ? `${key}:${options.requester}` : key
        ),
        i18n: { language: 'en' },
    }),
}));

import { AssetPendingChangePanel } from '@/pages/assets/AssetPendingChangePanel';
import type { AssetPendingChangeRead } from '@/types/asset';

function pendingChange(canViewDiff: boolean): AssetPendingChangeRead {
    return {
        approval_id: 86,
        proposal_id: 'proposal-86',
        proposal_version: 1,
        status: 'pending',
        requested_at: '2026-07-19T10:00:00Z',
        requested_by_name: 'Asset Owner',
        reason: 'Review protected Asset change',
        generic_label: 'protected_asset_change',
        mutation_kind: 'asset.link.asset.add',
        before: { name: 'Payments platform' },
        after: { name: 'Payments platform v2' },
        derived_impact: {
            assets: [
                {
                    resource_name: 'Payments platform',
                    before: { cif: 'no', resulting_criticality: 'important' },
                    after: { cif: 'yes', resulting_criticality: 'critical' },
                },
                {
                    resource_name: 'Customer ledger',
                    before: { cif: 'no', resulting_criticality: 'important' },
                    after: { cif: 'yes', resulting_criticality: 'critical' },
                },
            ],
        },
        impacted_resources: [
            { resource_type: 'asset', resource_name: 'Payments platform' },
            { resource_type: 'asset', resource_name: 'Customer ledger' },
        ],
        relationship_change: {
            target_resource_type: 'asset',
            target_resource_name: 'Customer ledger',
            action: 'add',
            before: {},
            after: { dependency_type: 'Datová' },
        },
        capabilities: { can_view_diff: canViewDiff, can_cancel: false },
    };
}

describe('AssetPendingChangePanel', () => {
    it('renders typed safe Asset changes and multi-Asset derived impact without raw JSON', () => {
        const { container } = render(
            <AssetPendingChangePanel pendingChange={pendingChange(true)} />,
        );

        expect(screen.getAllByText('Customer ledger')).toHaveLength(3);
        expect(screen.getByText('approvals:governed.relationship.resource_type.asset')).toBeInTheDocument();
        expect(screen.getByText('approvals:governed.relationship.action.add')).toBeInTheDocument();
        expect(screen.getAllByText('approvals:governed.derived.resulting_criticality')).toHaveLength(2);
        expect(container.querySelector('pre')).not.toBeInTheDocument();
        expect(container).not.toHaveTextContent('"name"');
    });

    it('renders Asset point impact as resulting criticality and never Process criticality class', () => {
        const point = pendingChange(true);
        point.mutation_kind = 'asset.edit';
        point.relationship_change = null;
        point.derived_impact = {
            before: { cif: 'no', resulting_criticality: 'medium' },
            after: { cif: 'yes', resulting_criticality: 'critical' },
        };
        render(<AssetPendingChangePanel pendingChange={point} />);

        expect(screen.getByText('assets:form.name')).toBeInTheDocument();
        expect(screen.getByText('Payments platform v2')).toBeInTheDocument();
        expect(screen.getByText('approvals:governed.derived.resulting_criticality')).toBeInTheDocument();
        expect(screen.queryByText('approvals:governed.derived.criticality_class')).not.toBeInTheDocument();
    });

    it('shows only the localized generic banner when snapshot access is denied', () => {
        render(<AssetPendingChangePanel pendingChange={pendingChange(false)} />);

        expect(screen.getByText('pending_change.badge')).toBeInTheDocument();
        expect(screen.getByText('pending_change.diff_restricted')).toBeInTheDocument();
        expect(screen.queryByText('Payments platform v2')).not.toBeInTheDocument();
        expect(screen.queryByText('Customer ledger')).not.toBeInTheDocument();
    });
});
