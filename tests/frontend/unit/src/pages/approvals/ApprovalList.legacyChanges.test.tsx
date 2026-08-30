import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { formatDateTimeValue, formatDateValue, formatNumberValue } from '@/i18n/formatters';
import { ApprovalList } from '@/pages/approvals/ApprovalList';
import { approvalRequestSchema } from '@/services/api/schemas';
import type { ApprovalRequest } from '@/types/approval';

const handlers = {
    onToggleRow: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onCancel: vi.fn(),
};

function legacyApproval(): ApprovalRequest {
    return {
        id: 91,
        resource_type: 'risk',
        resource_id: 701,
        resource_name: 'R-0042 · Supplier continuity',
        action_type: 'edit',
        pending_changes: {
            name: { old: 'Supplier continuity', new: 'Critical supplier continuity' },
            owner_id: { old: 'Unknown user', new: 'Bob Owner' },
            department_id: { old: 'Unknown department', new: null },
            is_priority: { old: false, new: true },
            gross_probability: { old: 2, new: 4 },
            acceptance_date: { old: '2026-04-10', new: null },
            secret_payload: { old: { token: 'do-not-render' }, new: 997 },
        },
        governed_mutation: null,
        status: 'pending',
        reason: 'Owner review required',
        requested_by_id: 2,
        requested_by_name: 'Requester',
        requested_by_email: 'requester@example.test',
        resolved_by_id: null,
        resolved_by_name: null,
        resolved_at: null,
        resolution_notes: null,
        created_at: '2026-04-01T00:00:00Z',
        can_approve: false,
        can_reject: false,
        capabilities: {
            can_read: true,
            can_approve: false,
            can_reject: false,
            can_cancel: false,
            can_cancel_as_requester: false,
            can_cancel_as_resolver: false,
            can_view_pending_changes: true,
            can_view_resolution_notes: false,
            can_inspect_side_effects: false,
            is_requester: false,
            is_primary_approver: false,
            is_privileged_resolver: false,
            is_pending: true,
            requires_privileged_resolution: false,
            would_apply_side_effects_on_approve: false,
        },
    };
}

function renderLegacyApproval(locale: 'en' | 'cs', approvals = [legacyApproval()]) {
    return render(
        <ApprovalList
            approvals={approvals}
            loading={false}
            expandedRows={new Set(approvals.map(({ id }) => id))}
            locale={locale}
            t={i18n.getFixedT(locale, 'approvals') as never}
            {...handlers}
        />,
    );
}

function approvalWithChanges(
    id: number,
    resourceType: ApprovalRequest['resource_type'],
    pendingChanges: ApprovalRequest['pending_changes'],
): ApprovalRequest {
    return {
        ...legacyApproval(),
        id,
        resource_type: resourceType,
        resource_name: `${resourceType} producer ${id}`,
        pending_changes: pendingChanges,
    };
}

describe('ApprovalList legacy pending changes', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('renders only allowlisted business labels and formatted actor-safe values', () => {
        renderLegacyApproval('en');
        const changes = screen.getByTestId('approval-legacy-changes-91');

        expect(within(changes).getByText('Name')).toBeInTheDocument();
        expect(within(changes).getByText('Accountable owner')).toBeInTheDocument();
        expect(within(changes).getByText('Owning Department')).toBeInTheDocument();
        expect(within(changes).getByText('Bob Owner')).toBeInTheDocument();
        expect(within(changes).getByText('Unknown user')).toBeInTheDocument();
        expect(within(changes).getByText('Unknown department')).toBeInTheDocument();
        expect(within(changes).getByText('No')).toBeInTheDocument();
        expect(within(changes).getByText('Yes')).toBeInTheDocument();
        expect(within(changes).getByText('2 of 5')).toBeInTheDocument();
        expect(within(changes).getByText(formatDateValue('2026-04-10', 'en'))).toBeInTheDocument();
        expect(within(changes).getAllByText('Not set')).toHaveLength(2);
        expect(within(changes).getByText('Restricted change')).toBeInTheDocument();

        for (const unsafeText of [
            'owner_id',
            'department_id',
            'secret_payload',
            '701',
            '997',
            'do-not-render',
            '[object Object]',
            'null',
        ]) {
            expect(within(changes).queryByText(unsafeText)).not.toBeInTheDocument();
        }
    });

    it('renders every field emitted by the current RiskUpdate producer', () => {
        const approval = approvalWithChanges(96, 'risk', {
            risk_id_code: { old: 'R-0042', new: 'R-0042-A' },
            name: { old: 'Supplier continuity', new: 'Critical supplier continuity' },
            process: { old: 'Claims', new: 'Underwriting' },
            subprocess: { old: null, new: 'Supplier onboarding' },
            risk_type: { old: 'operational', new: 'ict_risk' },
            category: { old: 'Operations', new: 'Technology' },
            description: { old: 'Old description', new: 'Updated description' },
            department_id: { old: 'Operations', new: 'Technology Risk' },
            owner_id: { old: 'Alice Owner', new: 'Bob Owner' },
            gross_probability: { old: 2, new: 4 },
            gross_impact: { old: 3, new: 5 },
            net_probability: { old: 2, new: 3 },
            net_impact: { old: 2, new: 4 },
            status: { old: 'active', new: 'emerging' },
            is_priority: { old: false, new: true },
            acceptance_approver: { old: null, new: 'Carol Approver' },
            acceptance_justification: { old: null, new: 'Within approved appetite' },
            acceptance_date: { old: null, new: '2026-05-20' },
        });

        renderLegacyApproval('en', [approval]);
        const changes = screen.getByTestId('approval-legacy-changes-96');

        for (const label of [
            'Risk ID',
            'Name',
            'Process',
            'Subprocess',
            'Risk type',
            'Category',
            'Description',
            'Owning Department',
            'Accountable owner',
            'Gross probability',
            'Gross impact',
            'Net probability',
            'Net impact',
            'Status',
            'Priority risk',
            'Acceptance approver',
            'Acceptance justification',
            'Acceptance date',
        ]) {
            expect(within(changes).getByText(label)).toBeInTheDocument();
        }
        expect(within(changes).getByText('Operational')).toBeInTheDocument();
        expect(within(changes).getByText('ICT risk')).toBeInTheDocument();
        expect(within(changes).queryByText('ict_risk')).not.toBeInTheDocument();
        expect(within(changes).getByText('Carol Approver')).toBeInTheDocument();
        expect(within(changes).getByText('Within approved appetite')).toBeInTheDocument();
        expect(within(changes).getByText(formatDateValue('2026-05-20', 'en'))).toBeInTheDocument();
        expect(within(changes).queryByText('Restricted change')).not.toBeInTheDocument();
    });

    it('renders every field emitted by the current ControlUpdate producer', () => {
        const approval = approvalWithChanges(97, 'control', {
            name: { old: 'Manual reconciliation', new: 'Automated reconciliation' },
            description: { old: 'Monthly control', new: 'Daily control' },
            data_source: { old: 'Ledger feed', new: 'Core platform export' },
            methodology_reference: { old: 'FIN-01', new: 'FIN-02' },
            control_form: { old: 'manual', new: 'automatic' },
            process_owner_position: { old: 'Finance Director', new: 'COO' },
            control_owner_id: { old: 'Alice Controller', new: 'Bob Controller' },
            executor_position: { old: 'Analyst', new: 'Senior Analyst' },
            frequency: { old: 'monthly', new: 'quarterly' },
            risk_level: { old: 3, new: 4 },
            output_description: { old: 'Signed checklist', new: 'Exception report' },
            report_recipient: { old: 'Finance Committee', new: 'Risk Committee' },
            documentation_location: { old: 'SharePoint / Finance', new: 'GRC evidence store' },
            department_id: { old: 'Finance', new: 'Risk' },
            status: { old: 'draft', new: 'active' },
        });

        renderLegacyApproval('en', [approval]);
        const changes = screen.getByTestId('approval-legacy-changes-97');

        for (const label of [
            'Name',
            'Description',
            'Data source',
            'Methodology reference',
            'Control form',
            'Process owner position',
            'Control owner',
            'Executor position',
            'Frequency',
            'Risk level',
            'Output description',
            'Report recipient',
            'Documentation location',
            'Owning Department',
            'Status',
        ]) {
            expect(within(changes).getByText(label)).toBeInTheDocument();
        }
        expect(within(changes).getByText('Ledger feed')).toBeInTheDocument();
        expect(within(changes).getByText('Core platform export')).toBeInTheDocument();
        expect(within(changes).getByText('Automatic')).toBeInTheDocument();
        expect(within(changes).getByText('Quarterly')).toBeInTheDocument();
        expect(within(changes).getByText('4 of 5')).toBeInTheDocument();
        expect(within(changes).queryByText('Restricted change')).not.toBeInTheDocument();
    });

    it('renders every field emitted by the current KRIUpdate producer', () => {
        const approval = approvalWithChanges(98, 'kri', {
            metric_name: { old: 'Availability', new: 'Service availability' },
            description: { old: 'Monthly uptime', new: 'Quarterly uptime' },
            current_value: { old: 97.25, new: 99.5 },
            lower_limit: { old: 95, new: 97 },
            upper_limit: { old: 100, new: 99.9 },
            unit: { old: '%', new: 'requests/minute' },
            frequency: { old: 'monthly', new: 'quarterly' },
            reporting_owner_id: { old: 'Unknown user', new: 'Reporting Owner' },
            linked_vendor_ids: { old: ['Unknown vendor'], new: ['Vendor Alpha'] },
        });

        renderLegacyApproval('en', [approval]);
        const changes = screen.getByTestId('approval-legacy-changes-98');

        for (const label of [
            'Metric name',
            'Description',
            'Current value',
            'Lower limit',
            'Upper limit',
            'Unit',
            'Frequency',
            'Reporting owner',
            'Linked vendors',
        ]) {
            expect(within(changes).getByText(label)).toBeInTheDocument();
        }
        expect(within(changes).getByText(formatNumberValue(97.25, 'en'))).toBeInTheDocument();
        expect(within(changes).getByText(formatNumberValue(99.5, 'en'))).toBeInTheDocument();
        expect(within(changes).getByText('Percentage')).toBeInTheDocument();
        expect(within(changes).getByText('requests/minute')).toBeInTheDocument();
        expect(within(changes).getByText('Unknown user')).toBeInTheDocument();
        expect(within(changes).getByText('Unknown vendor')).toBeInTheDocument();
        expect(within(changes).getByText('Vendor Alpha')).toBeInTheDocument();
        expect(within(changes).queryByText('Restricted change')).not.toBeInTheDocument();
    });

    it('renders the current KRI value-submission intake shape', () => {
        const approval = approvalWithChanges(99, 'kri', {
            current_value: { old: 97.25, new: 98.75 },
            period_end: { old: null, new: '2026-06-30' },
            recorded_at: { old: null, new: '2026-07-01T09:15:00Z' },
        });

        renderLegacyApproval('en', [approval]);
        const changes = screen.getByTestId('approval-legacy-changes-99');

        expect(within(changes).getByText('Current value')).toBeInTheDocument();
        expect(within(changes).getByText('Period end')).toBeInTheDocument();
        expect(within(changes).getByText('Recorded at')).toBeInTheDocument();
        expect(within(changes).getByText(formatNumberValue(98.75, 'en'))).toBeInTheDocument();
        expect(within(changes).getByText(formatDateValue('2026-06-30', 'en'))).toBeInTheDocument();
        expect(within(changes).getByText(
            formatDateTimeValue('2026-07-01T09:15:00Z', 'en'),
        )).toBeInTheDocument();
        expect(within(changes).queryByText('Restricted change')).not.toBeInTheDocument();
    });

    it('fails closed when a stored field is not part of that resource producer', () => {
        const approvals = [
            approvalWithChanges(100, 'risk', {
                control_form: { old: 'manual', new: 'automatic' },
            }),
            approvalWithChanges(101, 'control', {
                mitigations: { old: 'Daily review', new: 'Automated monitoring' },
            }),
            approvalWithChanges(102, 'kri', {
                is_priority: { old: false, new: true },
            }),
        ];

        renderLegacyApproval('en', approvals);

        for (const id of [100, 101, 102]) {
            const changes = screen.getByTestId(`approval-legacy-changes-${id}`);
            expect(within(changes).getByText('Restricted change')).toBeInTheDocument();
        }
        for (const unsafeText of [
            'Control form',
            'Manual',
            'Automatic',
            'Mitigations',
            'Daily review',
            'Automated monitoring',
            'Priority risk',
            'Yes',
            'No',
        ]) {
            expect(screen.queryByText(unsafeText)).not.toBeInTheDocument();
        }
    });

    it('preserves and renders the scalar KRI history correction as one explicit review', () => {
        const approval = approvalRequestSchema.parse({
            ...legacyApproval(),
            id: 95,
            resource_type: 'kri',
            resource_name: 'Availability (history correction)',
            pending_changes: {
                old_value: 97.25,
                new_value: 99.5,
                reason: 'Corrected from the signed monthly report',
                period_end: '2026-03-31',
                recorded_at: '2026-04-10T08:30:00Z',
            },
        });

        expect(approval.pending_changes?.old_value).toBe(97.25);
        expect(approval.pending_changes?.new_value).toBe(99.5);
        renderLegacyApproval('en', [approval]);

        const changes = screen.getByTestId('approval-legacy-changes-95');
        expect(within(changes).getByText('KRI history correction')).toBeInTheDocument();
        expect(within(changes).getByText('Value correction')).toBeInTheDocument();
        expect(within(changes).getByText(formatNumberValue(97.25, 'en'))).toBeInTheDocument();
        expect(within(changes).getByText(formatNumberValue(99.5, 'en'))).toBeInTheDocument();
        expect(within(changes).getByText('Correction reason')).toBeInTheDocument();
        expect(within(changes).getByText('Corrected from the signed monthly report')).toBeInTheDocument();
        expect(within(changes).getByText('Period end')).toBeInTheDocument();
        expect(within(changes).getByText(formatDateValue('2026-03-31', 'en'))).toBeInTheDocument();
        expect(within(changes).getByText('Recorded at')).toBeInTheDocument();
        expect(within(changes).getByText(
            formatDateTimeValue('2026-04-10T08:30:00Z', 'en'),
        )).toBeInTheDocument();
        expect(within(changes).queryByText('old_value')).not.toBeInTheDocument();
        expect(within(changes).queryByText('new_value')).not.toBeInTheDocument();
        expect(within(changes).queryByText('Restricted change')).not.toBeInTheDocument();
    });

    it('uses the Czech business labels and formatters without changing the safe field set', async () => {
        await i18n.changeLanguage('cs');
        renderLegacyApproval('cs');
        const changes = screen.getByTestId('approval-legacy-changes-91');

        expect(within(changes).getByText('Odpovědný vlastník')).toBeInTheDocument();
        expect(within(changes).getByText('Vlastnické oddělení')).toBeInTheDocument();
        expect(within(changes).getByText('Neznámý uživatel')).toBeInTheDocument();
        expect(within(changes).getByText('Neznámé oddělení')).toBeInTheDocument();
        expect(within(changes).getByText('Ne')).toBeInTheDocument();
        expect(within(changes).getByText('Ano')).toBeInTheDocument();
        expect(within(changes).getByText('2 z 5')).toBeInTheDocument();
        expect(within(changes).getByText(formatDateValue('2026-04-10', 'cs'))).toBeInTheDocument();
        expect(within(changes).getAllByText('Nenastaveno')).toHaveLength(2);
        expect(within(changes).getByText('Omezená změna')).toBeInTheDocument();
        expect(within(changes).queryByText('secret_payload')).not.toBeInTheDocument();
        expect(within(changes).queryByText('[object Object]')).not.toBeInTheDocument();
    });
});
