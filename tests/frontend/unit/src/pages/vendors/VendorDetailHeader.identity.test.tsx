import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { VendorDetailHeader } from '@/pages/vendors/VendorDetailHeader';
import type { Vendor } from '@/types/vendor';

const vendor = {
    id: 1,
    name: 'E2E-VENDOR-001 Claims Cloud Platform',
    registration_id: 'E2E-VREG-001',
    description: 'Cloud claims service',
    process: 'Claims',
    subprocess: null,
    outsourcing_owner_user_id: 2,
    outsourcing_owner: { name: 'Owner', email: 'owner@example.test', role_name: 'Owner' },
    owner_orphaned: false,
    ownership_status: 'assigned',
    linked_risks: [],
    vendor_type: 'ict',
    risk_score_1_5: 3,
    supports_important_core_insurance_function: false,
    dora_relevant: false,
    is_significant_vendor: false,
    has_alternative_providers: false,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
} satisfies Vendor;

// The header renders a breadcrumb link to the register (NAV-02), so it needs a router.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const handlers = {
    canArchive: false,
    canCreateIssue: false,
    canEdit: false,
    canRestore: false,
    onArchive: vi.fn(),
    onBack: vi.fn(),
    onEdit: vi.fn(),
    onOpenIssueModal: vi.fn(),
    onRestore: vi.fn(),
    registerHref: '/vendors',
};

describe('VendorDetailHeader identity', () => {
    it('shows Registration ID separately and leaves the canonical vendor name unchanged', () => {
        render(<VendorDetailHeader {...handlers} vendor={vendor} />);

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(vendor.name);
        expect(screen.getByText('E2E-VREG-001')).toBeVisible();
        expect(screen.getByRole('separator', { name: 'Identifier separator' })).toBeVisible();
        expect(screen.queryByText(`E2E-VREG-001${vendor.name}`)).not.toBeInTheDocument();
        // D14 / AX-06: a labelled back control and a breadcrumb trail ending at the record.
        expect(screen.getByRole('button', { name: 'Back to Vendors' })).toBeVisible();
        const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
        expect(trail).toHaveTextContent(vendor.name);
    });

    it('omits Registration ID and its separator together when the field is absent', () => {
        render(<VendorDetailHeader {...handlers} vendor={{ ...vendor, registration_id: null }} />);

        expect(screen.getByRole('heading', { level: 1, name: vendor.name })).toBeVisible();
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    it('exposes safe, named detail actions with decorative icons hidden from assistive technology', () => {
        render(
            <VendorDetailHeader
                {...handlers}
                canArchive
                canCreateIssue
                canEdit
                canRestore
                vendor={vendor}
            />,
        );

        const actions = screen.getAllByRole('button');
        expect(actions).toHaveLength(5);
        actions.forEach((action) => {
            expect(action).toHaveAttribute('type', 'button');
            expect(action).toHaveAccessibleName();
        });
        expect(document.querySelectorAll('button svg:not([aria-hidden="true"])')).toHaveLength(0);
    });
});
