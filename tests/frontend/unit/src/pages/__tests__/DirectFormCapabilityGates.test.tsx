import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlEditPage } from '@/pages/ControlEditPage';
import { ControlNewPage } from '@/pages/ControlNewPage';
import { KRINewPage } from '@/pages/KRINewPage';
import { RiskEditPage } from '@/pages/RiskEditPage';
import { RiskNewPage } from '@/pages/RiskNewPage';
import { VendorDetailPage } from '@/pages/VendorDetailPage';

const mockNavigate = vi.fn();
const mockGetControls = vi.fn();
const mockGetControl = vi.fn();
const mockGetKRIs = vi.fn();
const mockGetRisks = vi.fn();
const mockGetRisk = vi.fn();
const mockGetVendors = vi.fn();
const mockGetVendor = vi.fn();
let mockParams: Record<string, string> = {};
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLocation: () => ({ pathname: '/', search: '', state: null, hash: '', key: 'test' }),
        useNavigate: () => mockNavigate,
        useParams: () => mockParams,
        useSearchParams: () => [mockSearchParams],
    };
});

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControls: (...args: unknown[]) => mockGetControls(...args),
        getControl: (...args: unknown[]) => mockGetControl(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRIs: (...args: unknown[]) => mockGetKRIs(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
        getRisk: (...args: unknown[]) => mockGetRisk(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: unknown[]) => mockGetVendors(...args),
        getVendor: (...args: unknown[]) => mockGetVendor(...args),
    },
}));

vi.mock('@/components/control-form/ControlFormContainer', () => ({
    ControlForm: ({ allowRiskLinking }: { allowRiskLinking?: boolean }) => (
        <div data-allow-risk-linking={String(allowRiskLinking)} data-testid="control-form" />
    ),
}));

vi.mock('@/components/kri-form/KRIFormContainer', () => ({
    KRIFormContainer: () => <div data-testid="kri-form" />,
}));

vi.mock('@/components/RiskForm', () => ({
    RiskForm: () => <div data-testid="risk-form" />,
}));

vi.mock('@/pages/vendors/VendorFormView', () => ({
    VendorFormView: ({ mode }: { mode: string }) => <div data-testid={`vendor-form-${mode}`} />,
}));

vi.mock('@/pages/vendors/useVendorDetailPageEffects', () => ({
    useNormalizeLegacyVendorDetailSearch: vi.fn(),
    useVendorDeepLinkScroll: vi.fn(),
    useVendorFlashMessage: () => ({
        actionMessage: null,
        dismissActionMessage: vi.fn(),
        setActionMessage: vi.fn(),
    }),
}));

function listResponse(canCreate: boolean | undefined) {
    return {
        items: [],
        total: 0,
        offset: 0,
        limit: 1,
        capabilities: canCreate === undefined ? null : { can_create: canCreate },
    };
}

function riskDetail(canUpdate: boolean | undefined) {
    return {
        id: 10,
        name: 'Risk',
        capabilities: canUpdate === undefined ? null : { can_update: canUpdate },
    };
}

function controlDetail(capabilities: Record<string, boolean> | null) {
    return {
        id: 20,
        name: 'Control',
        capabilities,
    };
}

function vendorDetail(capabilities: Record<string, boolean> | null) {
    return {
        id: 30,
        name: 'Vendor',
        linked_risks: [],
        capabilities,
    };
}

function renderWithQueryClient(ui: ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('direct create/edit form capability gates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockParams = {};
        mockSearchParams = new URLSearchParams();
        mockGetControls.mockResolvedValue(listResponse(true));
        mockGetControl.mockResolvedValue(controlDetail({ can_update: true, can_link_risk: true }));
        mockGetKRIs.mockResolvedValue(listResponse(true));
        mockGetRisks.mockResolvedValue(listResponse(true));
        mockGetRisk.mockResolvedValue(riskDetail(true));
        mockGetVendors.mockResolvedValue(listResponse(true));
        mockGetVendor.mockResolvedValue(vendorDetail({ can_update: true }));
    });

    it('hides direct risk create when collection can_create is missing or false', async () => {
        mockGetRisks.mockResolvedValueOnce(listResponse(false));

        renderWithQueryClient(<RiskNewPage />);

        await waitFor(() => expect(mockGetRisks).toHaveBeenCalled());
        expect(screen.queryByTestId('risk-form')).not.toBeInTheDocument();
    });

    it('shows direct risk create when collection can_create is true', async () => {
        renderWithQueryClient(<RiskNewPage />);

        expect(await screen.findByTestId('risk-form')).toBeInTheDocument();
    });

    it('hides direct risk edit when detail can_update is missing or false', async () => {
        mockParams = { id: '10' };
        mockGetRisk.mockResolvedValueOnce(riskDetail(false));

        renderWithQueryClient(<RiskEditPage />);

        await waitFor(() => expect(mockGetRisk).toHaveBeenCalledWith(10));
        expect(screen.queryByTestId('risk-form')).not.toBeInTheDocument();
    });

    it('hides direct control create when collection can_create is missing or false', async () => {
        mockGetControls.mockResolvedValueOnce(listResponse(undefined));

        renderWithQueryClient(<ControlNewPage />);

        await waitFor(() => expect(mockGetControls).toHaveBeenCalled());
        expect(screen.queryByTestId('control-form')).not.toBeInTheDocument();
    });

    it('keeps risk linking enabled for normal direct control create', async () => {
        renderWithQueryClient(<ControlNewPage />);

        const form = await screen.findByTestId('control-form');
        expect(form).toHaveAttribute('data-allow-risk-linking', 'true');
    });

    it('passes edit detail link authority into the control form', async () => {
        mockParams = { id: '20' };
        mockGetControl.mockResolvedValueOnce(controlDetail({ can_update: true, can_link_risk: false }));

        renderWithQueryClient(<ControlEditPage />);

        const form = await screen.findByTestId('control-form');
        expect(form).toHaveAttribute('data-allow-risk-linking', 'false');
    });

    it('hides KRI create when collection can_create is false', async () => {
        mockGetKRIs.mockResolvedValueOnce(listResponse(false));

        renderWithQueryClient(<KRINewPage />);

        await waitFor(() => expect(mockGetKRIs).toHaveBeenCalled());
        expect(screen.queryByTestId('kri-form')).not.toBeInTheDocument();
    });

    it('hides vendor create when collection can_create is false', async () => {
        mockGetVendors.mockResolvedValueOnce(listResponse(false));

        renderWithQueryClient(<VendorDetailPage mode="new" />);

        await waitFor(() => expect(mockGetVendors).toHaveBeenCalled());
        expect(screen.queryByTestId('vendor-form-new')).not.toBeInTheDocument();
    });

    it('hides vendor edit when detail can_update is false', async () => {
        mockParams = { id: '30' };
        mockGetVendor.mockResolvedValueOnce(vendorDetail({ can_update: false }));

        renderWithQueryClient(<VendorDetailPage mode="edit" />);

        await waitFor(() => expect(mockGetVendor).toHaveBeenCalled());
        expect(screen.queryByTestId('vendor-form-edit')).not.toBeInTheDocument();
    });
});
