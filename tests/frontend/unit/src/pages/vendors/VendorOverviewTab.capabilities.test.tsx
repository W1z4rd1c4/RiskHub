import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
        <MemoryRouter>
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
            />
        </MemoryRouter>,
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
        expect(document.querySelector('#vendor-linked-risks')).not.toBeInTheDocument();
        expect(document.querySelector('#vendor-linked-controls')).not.toBeInTheDocument();
        expect(document.querySelector('#vendor-linked-kris')).not.toBeInTheDocument();
        expect(screen.queryByText('overview.summary.linked_exposure')).not.toBeInTheDocument();
    });

    it('fetches and mounts only linked registers explicitly exposed by backend capabilities', async () => {
        renderOverview(vendorWithLinkedVisibility({ controls: false, kris: false, risks: true }));

        await waitFor(() => expect(linkApiMocks.getLinkedRisks).toHaveBeenCalledTimes(1));
        expect(linkApiMocks.getLinkedRisks).toHaveBeenCalledWith(42);

        expect(linkApiMocks.getLinkedControls).not.toHaveBeenCalled();
        expect(linkApiMocks.getLinkedKRIs).not.toHaveBeenCalled();
        expect(document.querySelector('#vendor-linked-risks')).toBeInTheDocument();
        expect(document.querySelector('#vendor-linked-controls')).not.toBeInTheDocument();
        expect(document.querySelector('#vendor-linked-kris')).not.toBeInTheDocument();
    });

    it('keeps successful siblings but withholds combined exposure when one linked register fails', async () => {
        linkApiMocks.getLinkedRisks.mockRejectedValue(new Error('risk links unavailable'));

        renderOverview(vendorWithLinkedVisibility({ controls: true, kris: true, risks: true }));

        expect(await screen.findByRole('alert')).toHaveTextContent('links.errors.load_failed');
        const connections = screen.getByText('detail.connections').closest('.glass-card');
        expect(connections).not.toBeNull();
        const riskSummary = within(connections as HTMLElement).getByText('tabs.linked_risks').parentElement;
        const controlSummary = within(connections as HTMLElement).getByText('tabs.linked_controls').parentElement;
        const kriSummary = within(connections as HTMLElement).getByText('tabs.linked_kris').parentElement;

        await waitFor(() => {
            expect(riskSummary).toHaveTextContent('overview.summary.unavailable');
            expect(controlSummary).toHaveTextContent('0');
            expect(kriSummary).toHaveTextContent('0');
        });
        expect(riskSummary).not.toHaveTextContent('0');
        expect(screen.queryByText('overview.summary.linked_exposure')).not.toBeInTheDocument();
        expect(linkApiMocks.getLinkedControls).toHaveBeenCalledTimes(1);
        expect(linkApiMocks.getLinkedKRIs).toHaveBeenCalledTimes(1);
        expect(linkApiMocks.getLinkedRisks).toHaveBeenCalledTimes(1);
    });
});
