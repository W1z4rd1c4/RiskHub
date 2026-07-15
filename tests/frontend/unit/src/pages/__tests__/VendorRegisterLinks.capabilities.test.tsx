import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VendorRegisterLinksSection } from '@/pages/vendors/VendorRegisterLinksSection';

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
    can_manage_asset_links: boolean;
    can_manage_process_links: boolean;
}) {
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
        renderSection({ can_manage_asset_links: false, can_manage_process_links: false });

        expect(await screen.findByTestId('vendor-register-links-section')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-add')).not.toBeInTheDocument();
        expect(screen.queryByTestId('vendor-process-link-add')).not.toBeInTheDocument();
    });

    it('shows add controls when backend capabilities allow management', async () => {
        renderSection({ can_manage_asset_links: true, can_manage_process_links: true });

        expect(await screen.findByTestId('vendor-asset-link-add')).toBeInTheDocument();
        expect(screen.getByTestId('vendor-process-link-add')).toBeInTheDocument();
    });

    it('uses backend allow metadata even when the local compatibility projection is stale', async () => {
        canMock.mockReturnValue(false);

        renderSection({ can_manage_asset_links: false, can_manage_process_links: true });

        expect(await screen.findByTestId('vendor-process-link-add')).toBeInTheDocument();
        expect(screen.queryByTestId('vendor-asset-link-add')).not.toBeInTheDocument();
    });
});
