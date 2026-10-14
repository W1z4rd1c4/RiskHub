import type * as MockassetApiModule from '@/services/assetApi';
import type * as MockprocessApiModule from '@/services/processApi';
import type * as MockthreatApiModule from '@/services/threatApi';
import type * as MockcontrolApiModule from '@/services/controlApi';
import type * as MockkriApiModule from '@/services/kriApi';
import type * as MockriskApiModule from '@/services/riskApi';
import type * as MockvendorApiModule from '@/services/vendorApi';
import type * as Actualreactrouterdom from 'react-router-dom';
import { riskFixture, controlFixture, vendorFixture } from './pageFixtures';
import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInRouter as render } from '@test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetDetailPage } from '@/pages/AssetDetailPage';
import { ProcessDetailPage } from '@/pages/ProcessDetailPage';
import { ThreatDetailPage } from '@/pages/ThreatDetailPage';
import { ControlEditPage } from '@/pages/ControlEditPage';
import { ControlNewPage } from '@/pages/ControlNewPage';
import { KRINewPage } from '@/pages/KRINewPage';
import { RiskEditPage } from '@/pages/RiskEditPage';
import { RiskNewPage } from '@/pages/RiskNewPage';
import { VendorDetailPage } from '@/pages/VendorDetailPage';

const mockGetAssets = vi.fn<typeof MockassetApiModule.assetApi.getAssets>();
const mockGetProcesses = vi.fn<typeof MockprocessApiModule.processApi.getProcesses>();
const mockGetThreats = vi.fn<typeof MockthreatApiModule.threatApi.getThreats>();
const mockNavigate = vi.fn();
const mockGetControls = vi.fn<typeof MockcontrolApiModule.controlApi.getControls>();
const mockGetControl = vi.fn<typeof MockcontrolApiModule.controlApi.getControl>();
const mockGetKRIs = vi.fn<typeof MockkriApiModule.kriApi.getKRIs>();
const mockGetRisks = vi.fn<typeof MockriskApiModule.riskApi.getRisks>();
const mockGetRisk = vi.fn<typeof MockriskApiModule.riskApi.getRisk>();
const mockGetVendors = vi.fn<typeof MockvendorApiModule.vendorApi.getVendors>();
const mockGetVendor = vi.fn<typeof MockvendorApiModule.vendorApi.getVendor>();
let mockParams: Record<string, string> = {};
let mockSearchParams = new URLSearchParams();


vi.mock('@/services/assetApi', () => ({ assetApi: { getAssets: (...args: Parameters<typeof mockGetAssets>) => mockGetAssets(...args) } }));
vi.mock('@/services/processApi', () => ({ processApi: { getProcesses: (...args: Parameters<typeof mockGetProcesses>) => mockGetProcesses(...args) } }));
vi.mock('@/services/threatApi', () => ({ threatApi: { getThreats: (...args: Parameters<typeof mockGetThreats>) => mockGetThreats(...args) } }));
vi.mock('@/pages/assets/AssetForm', () => ({ AssetForm: () => <div data-testid="asset-form" /> }));
vi.mock('@/pages/processes/ProcessForm', () => ({ ProcessForm: () => <div data-testid="process-form" /> }));
vi.mock('@/pages/threats/ThreatForm', () => ({ ThreatForm: () => <div data-testid="threat-form" /> }));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof Actualreactrouterdom>('react-router-dom');
    return {
        ...actual,
        useLocation: () => ({ pathname: '/', search: '', state: null, hash: '', key: 'test' }),
        useNavigate: () => mockNavigate,
        useParams: () => mockParams,
        useSearchParams: () => [mockSearchParams],
    };
});

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({ canViewGovernance: false }),
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControls: (...args: Parameters<typeof mockGetControls>) => mockGetControls(...args),
        getControl: (...args: Parameters<typeof mockGetControl>) => mockGetControl(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRIs: (...args: Parameters<typeof mockGetKRIs>) => mockGetKRIs(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: Parameters<typeof mockGetRisks>) => mockGetRisks(...args),
        getRisk: (...args: Parameters<typeof mockGetRisk>) => mockGetRisk(...args),
    },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: {
        getVendors: (...args: Parameters<typeof mockGetVendors>) => mockGetVendors(...args),
        getVendor: (...args: Parameters<typeof mockGetVendor>) => mockGetVendor(...args),
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
    RiskForm: ({ onCancel, onSuccess }: { onCancel?: () => void; onSuccess?: (riskId: number) => void }) => (
        <div data-testid="risk-form">
            <button type="button" onClick={() => onCancel?.()}>cancel risk form</button>
            <button type="button" onClick={() => onSuccess?.(10)}>save risk form</button>
        </div>
    ),
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
        pending_creations: [],
        capabilities: canCreate === undefined ? null : { can_create: canCreate, can_export: false },
    };
}

function riskDetail(canUpdate: boolean | undefined) {
    return riskFixture({
        id: 10,
        name: 'Risk',
        capabilities: canUpdate === undefined ? null : { can_update: canUpdate },
    });
}

function controlDetail(capabilities: Record<string, boolean> | null) {
    return controlFixture({
        id: 20,
        name: 'Control',
        capabilities,
    });
}

function vendorDetail(capabilities: Record<string, boolean> | null) {
    return vendorFixture({
        id: 30,
        name: 'Vendor',
        linked_risks: [],
        capabilities,
    });
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
        mockGetAssets.mockResolvedValue(listResponse(true));
        mockGetProcesses.mockResolvedValue(listResponse(true));
        mockGetThreats.mockResolvedValue(listResponse(true));
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

    it.each([
        ['risk', () => <RiskNewPage />, mockGetRisks, 'risk-form'],
        ['control', () => <ControlNewPage />, mockGetControls, 'control-form'],
        ['kri', () => <KRINewPage />, mockGetKRIs, 'kri-form'],
        ['vendor', () => <VendorDetailPage mode="new" />, mockGetVendors, 'vendor-form-new'],
        ['asset', () => <AssetDetailPage mode="new" />, mockGetAssets, 'asset-form'],
        ['process', () => <ProcessDetailPage mode="new" />, mockGetProcesses, 'process-form'],
        ['threat', () => <ThreatDetailPage mode="new" />, mockGetThreats, 'threat-form'],
    ] as const)('%s creation distinguishes an outage from denial and supports retry', async (_name, page, load, formId) => {
        load.mockRejectedValueOnce(new TypeError('offline'));
        renderWithQueryClient(page());
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not check access. Please try again.');
        expect(screen.queryByTestId(formId)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByTestId(formId)).toBeInTheDocument();
        expect(load).toHaveBeenCalledTimes(2);
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

        await waitFor(() => expect(mockGetRisk).toHaveBeenCalledWith(10, { signal: expect.any(AbortSignal) }));
        expect(screen.queryByTestId('risk-form')).not.toBeInTheDocument();
    });

    it('returns direct Risk edit cancel and save to the exact safe list working set', async () => {
        const returnTo = '/risks?q=claims&view=department&page=3#group-heading';
        mockParams = { id: '10' };
        mockSearchParams = new URLSearchParams({ return_to: returnTo });

        renderWithQueryClient(<RiskEditPage />);
        await screen.findByTestId('risk-form');

        screen.getByRole('button', { name: 'cancel risk form' }).click();
        expect(mockNavigate).toHaveBeenCalledWith(
            `/risks/10?return_to=${encodeURIComponent(returnTo)}`,
        );

        mockNavigate.mockClear();
        screen.getByRole('button', { name: 'save risk form' }).click();
        expect(mockNavigate).toHaveBeenCalledWith(
            `/risks/10?return_to=${encodeURIComponent(returnTo)}`,
        );
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
