import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const translation = vi.hoisted(() => ({ namespaces: [] as unknown[] }));

vi.mock('@/i18n/hooks', async () => {
    const formatters = await vi.importActual<typeof import('@/i18n/formatters')>('@/i18n/formatters');
    return {
        useTranslation: (ns?: unknown) => {
            translation.namespaces.push(ns);
            return {
                t: (key: string, options?: { requester?: string; defaultValue?: string }) => (
                    options?.requester ? `${key}:${options.requester}` : key
                ),
                i18n: { language: 'en' },
            };
        },
        useFormat: () => ({
            locale: 'en',
            date: (value: string | null | undefined) => formatters.formatDateValue(value, 'en'),
            time: (value: string | null | undefined) => formatters.formatTimeValue(value, 'en'),
            number: (value: number | null | undefined) => formatters.formatNumberValue(value, 'en'),
        }),
    };
});

import {
    PENDING_CHANGE_PANEL_KEYS,
    PendingChangePanel,
    type PendingChangePanelData,
} from '@/components/approvals/PendingChangePanel';
import i18n from '@/i18n';
import type { AssetPendingChangeRead } from '@/types/asset';
import type { ProcessPendingChangeRead } from '@/types/process';
import type { ThreatPendingChangeRead } from '@/types/threat';

function assetPendingChange(canViewDiff: boolean): AssetPendingChangeRead {
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

function processPendingChange(canViewDiff: boolean, canCancel: boolean): ProcessPendingChangeRead {
    return {
        approval_id: 41,
        proposal_id: 'proposal-41',
        proposal_version: 1,
        status: 'pending',
        requested_at: '2026-07-16T09:00:00Z',
        requested_by_name: 'Alice Requester',
        reason: 'Improve resilience',
        before: { l1_process: 'Payments' },
        after: { l1_process: 'Payments v2' },
        derived_impact: {
            before: { cif: 'yes', criticality_class: 'critical' },
            after: { cif: 'yes', criticality_class: 'critical' },
        },
        capabilities: { can_view_diff: canViewDiff, can_cancel: canCancel },
    } as ProcessPendingChangeRead;
}

function threatPendingChange(canViewDiff: boolean, canCancel: boolean): ThreatPendingChangeRead {
    return {
        approval_id: 52,
        proposal_id: 'proposal-52',
        proposal_version: 1,
        status: 'pending',
        requested_at: '2026-07-20T08:00:00Z',
        requested_by_name: null,
        reason: 'Hand the scenario to a new steward',
        generic_label: 'accountability_reassignment',
        mutation_kind: 'threat.edit',
        before: { threat_steward: 'Old Steward' },
        after: { threat_steward: 'New Steward' },
        derived_impact: {},
        impacted_resources: [],
        capabilities: { can_view_diff: canViewDiff, can_cancel: canCancel },
    } as ThreatPendingChangeRead;
}

describe('PendingChangePanel (shared by Asset, Process, Threat)', () => {
    it('renders typed safe Asset changes and multi-Asset derived impact without raw JSON', () => {
        const { container } = render(
            <PendingChangePanel pendingChange={assetPendingChange(true)} namespace="assets" testIdPrefix="asset" />,
        );

        expect(screen.getAllByText('Customer ledger')).toHaveLength(3);
        expect(screen.getByText('approvals:governed.relationship.resource_type.asset')).toBeInTheDocument();
        expect(screen.getByText('approvals:governed.relationship.action.add')).toBeInTheDocument();
        expect(screen.getAllByText('approvals:governed.derived.resulting_criticality')).toHaveLength(2);
        expect(container.querySelector('pre')).not.toBeInTheDocument();
        expect(container).not.toHaveTextContent('"name"');
    });

    it('renders Asset point impact as resulting criticality and never Process criticality class', () => {
        const point = assetPendingChange(true);
        point.mutation_kind = 'asset.edit';
        point.relationship_change = null;
        point.derived_impact = {
            before: { cif: 'no', resulting_criticality: 'medium' },
            after: { cif: 'yes', resulting_criticality: 'critical' },
        };
        render(<PendingChangePanel pendingChange={point} namespace="assets" testIdPrefix="asset" />);

        expect(screen.getByText('assets:form.name')).toBeInTheDocument();
        expect(screen.getByText('Payments platform v2')).toBeInTheDocument();
        expect(screen.getByText('approvals:governed.derived.resulting_criticality')).toBeInTheDocument();
        expect(screen.queryByText('approvals:governed.derived.criticality_class')).not.toBeInTheDocument();
    });

    it('shows only the localized generic banner when snapshot access is denied', () => {
        render(<PendingChangePanel pendingChange={assetPendingChange(false)} namespace="assets" testIdPrefix="asset" />);

        expect(screen.getByText('pending_change.badge')).toBeInTheDocument();
        expect(screen.getByText('pending_change.diff_restricted')).toBeInTheDocument();
        expect(screen.queryByText('Payments platform v2')).not.toBeInTheDocument();
        expect(screen.queryByText('Customer ledger')).not.toBeInTheDocument();
        expect(screen.queryByText('Review protected Asset change')).not.toBeInTheDocument();
    });

    it('keeps the pending lifecycle separate and exposes scoped diff and cancel actions', () => {
        const onCancel = vi.fn();
        render(
            <PendingChangePanel
                pendingChange={processPendingChange(true, true)}
                namespace="processes"
                testIdPrefix="process"
                onCancel={onCancel}
            />,
        );

        expect(screen.getByText('pending_change.badge')).toBeInTheDocument();
        expect(screen.getByText('Payments v2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'pending_change.cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not leak proposed values or cancellation when capabilities deny them', () => {
        render(
            <PendingChangePanel
                pendingChange={processPendingChange(false, false)}
                namespace="processes"
                testIdPrefix="process"
                onCancel={vi.fn()}
            />,
        );

        expect(screen.getByText('pending_change.diff_restricted')).toBeInTheDocument();
        expect(screen.queryByText('Payments v2')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'pending_change.cancel' })).not.toBeInTheDocument();
    });

    it('hides the cancel action when no handler is supplied even if the capability is granted', () => {
        render(
            <PendingChangePanel
                pendingChange={threatPendingChange(true, true)}
                namespace="threats"
                testIdPrefix="threat"
            />,
        );

        expect(screen.queryByRole('button', { name: 'pending_change.cancel' })).not.toBeInTheDocument();
    });

    it('names the region by its title, keeps the module test ids and reads its own namespace', () => {
        translation.namespaces.length = 0;
        render(
            <PendingChangePanel
                pendingChange={threatPendingChange(true, true)}
                namespace="threats"
                testIdPrefix="threat"
                cancelling
                onCancel={vi.fn()}
            />,
        );

        const panel = screen.getByTestId('threat-pending-change');
        expect(panel).toHaveAttribute('aria-labelledby', 'threat-pending-change-title');
        expect(screen.getByRole('heading', { level: 2, name: 'pending_change.title' })).toHaveAttribute(
            'id',
            'threat-pending-change-title',
        );
        expect(screen.getByTestId('threat-pending-change-diff')).toBeInTheDocument();
        expect(screen.getByText('Hand the scenario to a new steward')).toBeInTheDocument();
        expect(screen.getByText(/pending_change\.requested_by_at/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'pending_change.cancel' })).toBeDisabled();
        expect(translation.namespaces).toContain('threats');
    });

    it('accepts the Vendor pending-change shape structurally', () => {
        const vendorShape: PendingChangePanelData = {
            reason: 'Critical service scope changed',
            requested_at: '2026-07-30T08:30:00Z',
            requested_by_name: 'Alice Requester',
            before: { name: 'Payments provider' },
            after: { name: 'Critical payments provider' },
            derived_impact: { before: { tier: 'standard' }, after: { tier: 'critical' } },
            impacted_resources: [{ resource_type: 'vendor', resource_name: 'Payments provider' }],
            relationship_change: null,
            mutation_kind: 'vendor.edit',
            capabilities: { can_view_diff: true, can_cancel: false },
        };
        render(<PendingChangePanel pendingChange={vendorShape} namespace="vendors" testIdPrefix="vendor" />);

        expect(screen.getByTestId('vendor-pending-change')).toBeInTheDocument();
        expect(screen.getByText('Critical service scope changed')).toBeInTheDocument();
    });
});

describe('PendingChangePanel locale coverage', () => {
    // The panel reads `<namespace>:pending_change.<key>` through a module-bound `t`, which the
    // static usage validator cannot follow, so this keeps all four namespaces complete in en + cs.
    it.each(['assets', 'processes', 'threats', 'vendors'])('%s provides every pending_change string in en and cs', (namespace) => {
        for (const language of ['en', 'cs']) {
            const t = i18n.getFixedT(language, namespace);
            for (const key of PENDING_CHANGE_PANEL_KEYS) {
                expect(i18n.exists(`${namespace}:pending_change.${key}`, { lng: language }), `${language} ${namespace} ${key}`).toBe(true);
                expect(t(`pending_change.${key}`, { requester: 'X', date: 'D', time: 'T' })).not.toBe(`pending_change.${key}`);
            }
        }
    });
});
