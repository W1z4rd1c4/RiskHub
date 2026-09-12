import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { renderWithQueryClient as render } from '@test/render';

const getRiskMock = vi.fn();
const getLinkedControlsMock = vi.fn();
const getLinkedVendorsMock = vi.fn();
const getOverdueMock = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '7' }),
    };
});

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => getRiskMock(...args),
        getLinkedControls: (...args: unknown[]) => getLinkedControlsMock(...args),
        getLinkedVendors: (...args: unknown[]) => getLinkedVendorsMock(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getOverdue: (...args: unknown[]) => getOverdueMock(...args),
    },
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskTypes: () => ({
        getColor: () => 'text-white',
        getDisplayName: () => 'Operational',
    }),
}));

vi.mock('@/components/risks/detail-overview/RiskAssessmentSection', () => ({
    RiskAssessmentSection: () => null,
}));
vi.mock('@/components/risks/detail-overview/RiskSummaryCards', () => ({
    RiskSummaryCards: ({
        activeControlCount,
        children,
        linkedVendorCount,
    }: {
        activeControlCount: number | null;
        children: React.ReactNode;
        linkedVendorCount: number | null;
    }) => <div><span>counts:{activeControlCount ?? '—'}:{linkedVendorCount ?? '—'}</span>{children}</div>,
}));
vi.mock('@/components/risks/detail-overview/RiskKriSection', () => ({
    RiskKriSection: ({
        canCreateKri,
        overdueKRIs,
        risk: currentRisk,
    }: {
        canCreateKri: boolean;
        overdueKRIs: Array<{ kri_id: number }>;
        risk: { kris?: Array<{ id: number; name: string }> };
    }) => (
        <div>
            {currentRisk.kris?.map(({ id, name }) => <span key={id}>kri:{name}</span>)}
            {canCreateKri ? <button type="button">add-kri</button> : null}
            {overdueKRIs.length > 0
                ? overdueKRIs.map(({ kri_id }) => <span key={kri_id}>overdue:{kri_id}</span>)
                : <span>empty-overdue</span>}
        </div>
    ),
}));
vi.mock('@/components/risks/detail-overview/RiskLinkedControlsSection', () => ({
    RiskLinkedControlsSection: ({
        linkedControls,
        onRefreshData,
    }: {
        linkedControls: Array<{ control: { name: string } }>;
        onRefreshData: () => void;
    }) => (
        <div>
            {linkedControls.length > 0
                ? linkedControls.map(({ control }) => <span key={control.name}>control:{control.name}</span>)
                : <span>empty-controls</span>}
            <button type="button" onClick={onRefreshData}>refresh-sidecars</button>
        </div>
    ),
}));
vi.mock('@/components/risks/detail-overview/RiskLinkedVendorsSection', () => ({
    RiskLinkedVendorsSection: ({ linkedVendors }: { linkedVendors: Array<{ name: string }> }) => (
        <div>{linkedVendors.length > 0
            ? linkedVendors.map(({ name }) => <span key={name}>vendor:{name}</span>)
            : <span>empty-vendors</span>}</div>
    ),
}));
vi.mock('@/components/risks/detail-overview/RiskRegisterLinksSection', () => ({
    RiskRegisterLinksSection: () => null,
}));
vi.mock('@/components/risks/detail-overview/RiskTimestamps', () => ({ RiskTimestamps: () => null }));
vi.mock('@/components/risks/RiskDetailQuestionnairesTab', () => ({
    RiskDetailQuestionnairesTab: () => null,
}));
vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

function risk(overrides: Record<string, unknown> = {}) {
    return {
        id: 7,
        risk_id_code: 'RISK-007',
        name: 'Liquidity Risk',
        status: 'active',
        is_priority: false,
        process: 'Treasury',
        description: 'Liquidity mismatch.',
        kris: [],
        capabilities: {},
        ...overrides,
    };
}

function linkedControl(name: string) {
    return {
        id: 1,
        control_id: 1,
        risk_id: 7,
        effectiveness: 'high',
        control: { id: 1, name, status: 'active', is_archived: false },
    };
}

function vendor(name: string) {
    return { id: 1, name, risk_score_1_5: 2 };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => { resolve = accept; });
    return { promise, resolve };
}

describe('Risk detail optional sidecar outcomes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getRiskMock.mockResolvedValue(risk());
        getLinkedVendorsMock.mockResolvedValue([vendor('Vendor A')]);
        getOverdueMock.mockResolvedValue([]);
    });

    it('keeps core Risk content usable and retries an initially failed sidecar locally', async () => {
        getLinkedControlsMock
            .mockRejectedValueOnce(new Error('controls unavailable'))
            .mockResolvedValueOnce([linkedControl('Control A')]);

        render(<MemoryRouter><RiskDetailPage /></MemoryRouter>);

        expect(await screen.findByRole('heading', { name: 'Liquidity Risk' })).toBeInTheDocument();
        expect(await screen.findByText('vendor:Vendor A')).toBeInTheDocument();
        const failure = await screen.findByTestId('risk-linked-controls-load-state');
        expect(screen.queryByRole('heading', { name: /record unavailable/i })).not.toBeInTheDocument();

        fireEvent.click(within(failure).getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('control:Control A')).toBeInTheDocument();
        expect(screen.queryByTestId('risk-linked-controls-load-state')).not.toBeInTheDocument();
    });

    it('does not quantify or render false-empty sidecars during initial loading', async () => {
        const controls = deferred<ReturnType<typeof linkedControl>[]>();
        const vendors = deferred<ReturnType<typeof vendor>[]>();
        const overdue = deferred<Array<{ kri_id: number }>>();
        getLinkedControlsMock.mockReturnValueOnce(controls.promise);
        getLinkedVendorsMock.mockReturnValueOnce(vendors.promise);
        getOverdueMock.mockReturnValueOnce(overdue.promise);

        render(<MemoryRouter><RiskDetailPage /></MemoryRouter>);

        expect(await screen.findByRole('heading', { name: 'Liquidity Risk' })).toBeInTheDocument();
        expect(screen.getByText('counts:—:—')).toBeInTheDocument();
        expect(screen.queryByText('empty-controls')).not.toBeInTheDocument();
        expect(screen.queryByText('empty-vendors')).not.toBeInTheDocument();
        expect(screen.queryByText('empty-overdue')).not.toBeInTheDocument();

        await act(async () => {
            controls.resolve([]);
            vendors.resolve([]);
            overdue.resolve([]);
        });

        expect(await screen.findByText('counts:0:0')).toBeInTheDocument();
        expect(screen.getByText('empty-controls')).toBeInTheDocument();
        expect(screen.getByText('empty-vendors')).toBeInTheDocument();
        expect(screen.getByText('empty-overdue')).toBeInTheDocument();
    });

    it('retains stale data on ordinary failure and clears it on protected denial', async () => {
        getLinkedControlsMock.mockResolvedValueOnce([linkedControl('Control A')]);
        render(<MemoryRouter><RiskDetailPage /></MemoryRouter>);

        expect(await screen.findByText('control:Control A')).toBeInTheDocument();
        expect(await screen.findByText('vendor:Vendor A')).toBeInTheDocument();

        getLinkedControlsMock.mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        getLinkedVendorsMock.mockRejectedValueOnce(new Error('vendors unavailable'));
        fireEvent.click(screen.getByRole('button', { name: 'refresh-sidecars' }));

        const denied = await screen.findByTestId('risk-linked-controls-load-state');
        expect(screen.queryByText('control:Control A')).not.toBeInTheDocument();
        expect(within(denied).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

        const stale = await screen.findByTestId('risk-linked-vendors-load-state');
        expect(screen.getByText('vendor:Vendor A')).toBeInTheDocument();
        getLinkedVendorsMock.mockResolvedValueOnce([vendor('Vendor B')]);
        fireEvent.click(within(stale).getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.getByText('vendor:Vendor B')).toBeInTheDocument());
        expect(screen.queryByText('vendor:Vendor A')).not.toBeInTheDocument();
    });

    it('clears protected linked rows and actions when refresh returns anti-enumeration 404', async () => {
        getLinkedControlsMock.mockResolvedValueOnce([linkedControl('Control A')]);
        render(<MemoryRouter><RiskDetailPage /></MemoryRouter>);

        expect(await screen.findByText('control:Control A')).toBeInTheDocument();
        expect(await screen.findByText('vendor:Vendor A')).toBeInTheDocument();

        const unavailable = new ApiClientError({
            status: 404,
            messageKey: 'errorKeys.not_found',
        });
        getLinkedControlsMock.mockRejectedValueOnce(unavailable);
        getLinkedVendorsMock.mockRejectedValueOnce(unavailable);
        fireEvent.click(screen.getByRole('button', { name: 'refresh-sidecars' }));

        const controlsDenied = await screen.findByTestId('risk-linked-controls-load-state');
        const vendorsDenied = await screen.findByTestId('risk-linked-vendors-load-state');
        expect(screen.queryByText('control:Control A')).not.toBeInTheDocument();
        expect(screen.queryByText('vendor:Vendor A')).not.toBeInTheDocument();
        expect(within(controlsDenied).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(within(vendorsDenied).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it.each([
        ['ordinary failure', new Error('overdue unavailable')],
        ['protected denial', new ApiClientError({ status: 403, messageKey: 'errorKeys.forbidden' })],
    ])('keeps core KRI cards and Add KRI usable after an overdue annotation %s', async (_label, failure) => {
        getRiskMock.mockResolvedValue(risk({
            kris: [{ id: 81, name: 'Liquidity threshold' }],
            capabilities: { can_create_kri: true },
        }));
        getLinkedControlsMock.mockResolvedValue([]);
        getOverdueMock.mockRejectedValue(failure);

        render(<MemoryRouter><RiskDetailPage /></MemoryRouter>);

        expect(await screen.findByText('kri:Liquidity threshold')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'add-kri' })).toBeInTheDocument();
        expect(screen.queryByText('overdue:81')).not.toBeInTheDocument();
        const localOutcome = await screen.findByTestId('risk-overdue-kris-load-state');
        if (failure instanceof ApiClientError) {
            expect(within(localOutcome).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        } else {
            expect(within(localOutcome).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        }
    });
});
