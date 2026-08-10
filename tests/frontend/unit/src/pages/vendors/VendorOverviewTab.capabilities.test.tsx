import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorOverviewTab } from '@/pages/vendors/VendorOverviewTab';
import type { Vendor } from '@/types/vendor';

const linkApiMocks = vi.hoisted(() => ({
    getLinkedControls: vi.fn(),
    getLinkedKRIs: vi.fn(),
    getLinkedRisks: vi.fn(),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        i18n: { language: 'en' },
        t: (key: string) => key,
    }),
}));

vi.mock('@/services/vendorLinkApi', () => ({
    vendorLinkApi: linkApiMocks,
}));

vi.mock('@/components/vendors/VendorLinkedRisksTab', () => ({
    VendorLinkedRisksTab: () => <div data-testid="linked-risks-surface" />,
}));

vi.mock('@/components/vendors/VendorLinkedControlsTab', () => ({
    VendorLinkedControlsTab: () => <div data-testid="linked-controls-surface" />,
}));

vi.mock('@/components/vendors/VendorLinkedKRIsTab', () => ({
    VendorLinkedKRIsTab: () => <div data-testid="linked-kris-surface" />,
}));

vi.mock('@/pages/vendors/VendorContractsSection', () => ({
    VendorContractsSection: () => null,
}));

vi.mock('@/pages/vendors/VendorDerivedSection', () => ({
    VendorDerivedSection: () => null,
}));

vi.mock('@/pages/vendors/VendorRegisterLinksSection', () => ({
    VendorRegisterLinksSection: () => null,
}));

vi.mock('@/pages/vendors/VendorSubOutsourcingSection', () => ({
    VendorSubOutsourcingSection: () => null,
}));

function vendorWithLinkedVisibility({
    controls,
    kris,
    risks,
}: {
    controls: boolean;
    kris: boolean;
    risks: boolean;
}): Vendor {
    return {
        id: 42,
        name: 'Capability-scoped Vendor',
        process: 'Claims',
        outsourcing_owner_user_id: 7,
        outsourcing_owner: null,
        ownership_status: 'assigned',
        vendor_type: 'ict',
        risk_score_1_5: 3,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        has_alternative_providers: false,
        is_archived: false,
        created_at: '2026-07-16T08:00:00Z',
        updated_at: '2026-07-16T08:00:00Z',
        linked_risks: [],
        capabilities: {
            can_view_linked_controls: controls,
            can_view_linked_kris: kris,
            can_view_linked_risks: risks,
            can_view_contracts: false,
            can_view_sub_outsourcing: false,
        },
    } as Vendor;
}

function renderOverview(vendor: Vendor) {
    return render(
        <VendorOverviewTab
            vendor={vendor}
            canCreateControl={false}
            canCreateKri={false}
            canCreateRisk={false}
            canLinkControl={false}
            canLinkKri={false}
            canLinkRisk={false}
            onAddControl={vi.fn()}
            onAddKri={vi.fn()}
            onAddRisk={vi.fn()}
            onNavigateToControl={vi.fn()}
            onNavigateToKri={vi.fn()}
            onNavigateToRisk={vi.fn()}
        />,
    );
}

describe('VendorOverviewTab linked-register capabilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        linkApiMocks.getLinkedControls.mockResolvedValue([]);
        linkApiMocks.getLinkedKRIs.mockResolvedValue([]);
        linkApiMocks.getLinkedRisks.mockResolvedValue([]);
    });

    it('makes zero linked-register requests and mounts no linked surfaces when all view capabilities are false', async () => {
        renderOverview(vendorWithLinkedVisibility({ controls: false, kris: false, risks: false }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(linkApiMocks.getLinkedRisks).not.toHaveBeenCalled();
        expect(linkApiMocks.getLinkedControls).not.toHaveBeenCalled();
        expect(linkApiMocks.getLinkedKRIs).not.toHaveBeenCalled();
        expect(screen.queryByTestId('linked-risks-surface')).not.toBeInTheDocument();
        expect(screen.queryByTestId('linked-controls-surface')).not.toBeInTheDocument();
        expect(screen.queryByTestId('linked-kris-surface')).not.toBeInTheDocument();
        expect(screen.queryByText('overview.summary.linked_exposure')).not.toBeInTheDocument();
    });

    it('fetches and mounts only linked registers explicitly exposed by backend capabilities', async () => {
        renderOverview(vendorWithLinkedVisibility({ controls: false, kris: false, risks: true }));

        await waitFor(() => expect(linkApiMocks.getLinkedRisks).toHaveBeenCalledWith(42));

        expect(linkApiMocks.getLinkedControls).not.toHaveBeenCalled();
        expect(linkApiMocks.getLinkedKRIs).not.toHaveBeenCalled();
        expect(screen.getByTestId('linked-risks-surface')).toBeInTheDocument();
        expect(screen.queryByTestId('linked-controls-surface')).not.toBeInTheDocument();
        expect(screen.queryByTestId('linked-kris-surface')).not.toBeInTheDocument();
    });
});
