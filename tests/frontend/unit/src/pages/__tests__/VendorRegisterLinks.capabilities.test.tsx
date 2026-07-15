import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VendorRegisterLinksSection } from '@/pages/vendors/VendorRegisterLinksSection';
import { assetApi } from '@/services/assetApi';
import { vendorApi } from '@/services/vendorApi';

const canMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ can: canMock }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getAssetLinks: vi.fn().mockResolvedValue([]),
        getProcessLinks: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getAssets: vi.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
        addVendorLink: vi.fn(),
        removeVendorLink: vi.fn(),
    },
}));

vi.mock('@/services/processApi', () => ({
    processApi: {
        getProcesses: vi.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
        addVendorLink: vi.fn(),
        removeVendorLink: vi.fn(),
    },
}));

vi.mock('@/services/vendorSubOutsourcingApi', () => ({
    vendorSubOutsourcingApi: {
        getIctServiceTaxonomy: vi.fn().mockResolvedValue([]),
    },
}));

afterEach(() => {
    canMock.mockReset();
    canMock.mockReturnValue(true);
});

function renderSection(capabilities: {
    can_view_asset_links: boolean;
    can_manage_asset_links: boolean;
    can_manage_process_links: boolean;
} | null) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <VendorRegisterLinksSection vendorId={4} capabilities={capabilities} />
        </QueryClientProvider>,
    );
}

describe('Vendor register-link backend capability gates', () => {
    it('hides add controls when backend capabilities deny management', async () => {
        renderSection({
            can_view_asset_links: true,
            can_manage_asset_links: false,
            can_manage_process_links: false,
        });

        expect(await screen.findByTestId('vendor-register-links-section')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-add')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-process-link-add')).not.toBeInTheDocument();
    });

    it('shows add controls when backend capabilities allow management', async () => {
        renderSection({
            can_view_asset_links: true,
            can_manage_asset_links: true,
            can_manage_process_links: true,
        });

        expect(await screen.findByTestId('vendor-asset-link-add')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-process-link-add')).toBeInTheDocument();
    });

    it('uses backend collection metadata as authoritative over the local compatibility projection', async () => {
        renderSection({
            can_view_asset_links: false,
            can_manage_asset_links: false,
            can_manage_process_links: true,
        });

        expect(await screen.findByTestId('vendor-process-link-add')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-links-block')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-add')).not.toBeInTheDocument();
    });

    it('falls back to the local Asset read projection when backend metadata is absent', async () => {
        renderSection(null);

        expect(await screen.findByTestId('vendor-asset-links-block')).toBeInTheDocument();
    });

    it('keeps archived visible Vendor links readable and allows row-authorized cleanup', async () => {
        canMock.mockReturnValue(false);
        vi.mocked(vendorApi.getAssetLinks).mockResolvedValue([
            {
                id: 41,
                asset_id: 7,
                vendor_id: 4,
                asset_name: 'Archived Vendor dependency',
                ict_service_code: 'S01',
                capabilities: { can_delete: true },
                created_at: '2026-07-15T08:00:00Z',
            },
        ]);
        vi.mocked(assetApi.removeVendorLink).mockResolvedValue(undefined);

        renderSection({
            can_view_asset_links: true,
            can_manage_asset_links: false,
            can_manage_process_links: false,
        });

        expect(await screen.findByText('Archived Vendor dependency')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-add')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('vendor-asset-link-remove-41'));

        await waitFor(() => {
            expect(assetApi.removeVendorLink).toHaveBeenCalledWith(7, 41);
        });
    });

    it('keeps pending record-owner links readable while honoring mutation denial', async () => {
        canMock.mockReturnValue(false);
        vi.mocked(vendorApi.getAssetLinks).mockResolvedValue([
            {
                id: 42,
                asset_id: 8,
                vendor_id: 4,
                asset_name: 'Pending owner asset',
                ict_service_code: 'S02',
                capabilities: { can_delete: false },
                created_at: '2026-07-15T08:00:00Z',
            },
        ]);

        renderSection({
            can_view_asset_links: true,
            can_manage_asset_links: false,
            can_manage_process_links: false,
        });

        expect(await screen.findByText('Pending owner asset')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-add')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-remove-42')).not.toBeInTheDocument();
    });
});
