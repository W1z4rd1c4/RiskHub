import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalList } from '@/pages/approvals/ApprovalList';
import { approvalRequestSchema } from '@/services/api/schemas';

import kriRemove from '../../services/fixtures/vendorLinkApprovals/vendor-link-kri-remove.json';
import riskAdd from '../../services/fixtures/vendorLinkApprovals/vendor-link-risk-add.json';

const handlers = {
    onToggleRow: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onCancel: vi.fn(),
};
const t = (key: string) => key;

const renderApproval = (detail: unknown, { expanded = false } = {}) => {
    const approval = approvalRequestSchema.parse(detail);
    render(
        <ApprovalList
            approvals={[approval]}
            loading={false}
            expandedRows={expanded ? new Set([approval.id]) : new Set<number>()}
            t={t as never}
            {...handlers}
        />,
    );
    return approval;
};

describe('ApprovalList governed Vendor relationship mutation (#99)', () => {
    it('renders an approvals row from the schema-parsed vendor.link.risk.add payload', () => {
        renderApproval(riskAdd.detail);

        expect(screen.getByText('Seam Vendor vendor.link.risk.add')).toBeInTheDocument();
        expect(screen.getByText('request_types.link_add')).toBeInTheDocument();
    });

    it('renders the expanded detail view with the relationship and the tier point impact', () => {
        const approval = renderApproval(riskAdd.detail, { expanded: true });

        expect(screen.getByTestId(`approval-governed-mutation-${approval.id}`)).toBeInTheDocument();
        expect(screen.getByText('Test Risk')).toBeInTheDocument();
        expect(screen.getByText('Add relationship')).toBeInTheDocument();
        expect(screen.getByText('Vendor tier')).toBeInTheDocument();
        expect(screen.getAllByText('Significant provider')).toHaveLength(2);
    });

    it('renders the remove-relationship detail view for vendor.link.kri.remove', () => {
        const approval = renderApproval(kriRemove.detail, { expanded: true });

        expect(screen.getByTestId(`approval-governed-mutation-${approval.id}`)).toBeInTheDocument();
        expect(screen.getByText('Provider incident rate')).toBeInTheDocument();
        expect(screen.getByText('Remove relationship')).toBeInTheDocument();
    });
});
