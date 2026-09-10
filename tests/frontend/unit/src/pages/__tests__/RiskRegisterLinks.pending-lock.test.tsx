import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskRegisterLinksSection } from '@/components/risks/detail-overview/RiskRegisterLinksSection';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { ApiClientError } from '@/services/apiClient';
import { riskRegisterLinksApi } from '@/services/threatApi';
import type { Risk } from '@/types/risk';

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        getRiskLinks: vi.fn().mockResolvedValue([]),
        getThreats: vi.fn().mockResolvedValue({ items: [] }),
    },
    riskRegisterLinksApi: {
        getThreatLinks: vi.fn().mockResolvedValue([]),
        getProcessLinks: vi.fn().mockResolvedValue([{
            id: 61,
            risk_id: 4,
            process_id: 9,
            process_name: 'Locked settlement',
            process_business_edit_blocked: true,
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]),
        getAssetLinks: vi.fn().mockResolvedValue([]),
        addThreatLink: vi.fn(),
        removeThreatLink: vi.fn(),
        addProcessLink: vi.fn(),
        removeProcessLink: vi.fn(),
        addAssetLink: vi.fn(),
        removeAssetLink: vi.fn(),
    },
}));

vi.mock('@/services/processApi', () => ({
    processApi: { getProcesses: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: { getAssets: vi.fn().mockResolvedValue({ items: [] }) },
}));

describe('RiskRegisterLinksSection Process impact lock', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(riskRegisterLinksApi.getThreatLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([{
            id: 61,
            risk_id: 4,
            process_id: 9,
            process_name: 'Locked settlement',
            process_business_edit_blocked: true,
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([]);
    });

    it('keeps the relationship readable but disables the row-authorized unlink', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        expect(await screen.findByText('Locked settlement')).toBeInTheDocument();
        expect(screen.getByTestId('risk-process-link-remove-61')).toBeDisabled();
        expect(screen.getByText(/pending governed change/i)).toBeInTheDocument();
    });

    it('collects a reason and navigates to a governed Risk-to-Asset unlink approval', async () => {
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([{
            id: 71,
            risk_id: 4,
            asset_id: 11,
            asset_name: 'Protected asset',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.removeAssetLink).mockResolvedValue({
            status: 'approval_required',
            message: 'Queued',
            approval_id: 187,
            action_type: 'edit',
            pending_fields: ['relationship'],
            proposal_id: 'proposal-risk-asset-187',
            proposal_version: 1,
        });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                    <LocationProbe />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        fireEvent.click(await screen.findByTestId('risk-asset-link-remove-71'));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Review protected risk dependency' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(riskRegisterLinksApi.removeAssetLink).toHaveBeenCalledWith(
                4,
                71,
                'Review protected risk dependency',
            );
            expect(screen.getByTestId('location')).toHaveTextContent('/approvals?tab=mine&approvalId=187');
        });
    });

    it('renders initial lane failures locally without hiding successful siblings', async () => {
        vi.mocked(riskRegisterLinksApi.getThreatLinks).mockResolvedValue([{
            id: 51,
            risk_id: 4,
            threat_id: 5,
            threat_name: 'Flooding',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockRejectedValue(new Error('process links unavailable'));
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([{
            id: 71,
            risk_id: 4,
            asset_id: 11,
            asset_name: 'Payments gateway',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });

        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        expect(await screen.findByText('Flooding')).toBeInTheDocument();
        expect(screen.getByText('Payments gateway')).toBeInTheDocument();
        const processFailure = await screen.findByTestId('risk-process-link-load-state');
        expect(within(processFailure).getByRole('button', { name: /retry/i })).toBeInTheDocument();
        expect(screen.getByTestId('risk-threat-link-add')).toBeInTheDocument();
        expect(screen.getByTestId('risk-asset-link-add')).toBeInTheDocument();
    });

    it('retains stale lane rows with Retry but clears cached protected rows and actions on 403', async () => {
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([{
            id: 61,
            risk_id: 4,
            process_id: 9,
            process_name: 'Settlement',
            process_business_edit_blocked: false,
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([{
            id: 71,
            risk_id: 4,
            asset_id: 11,
            asset_name: 'Payments gateway',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        expect(await screen.findByText('Settlement')).toBeInTheDocument();
        expect(screen.getByText('Payments gateway')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('risk-process-link-remove-61'));
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();

        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockRejectedValue(new Error('asset refresh failed'));
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: ictRegisterKeys.riskAssetLinks(4) });
        });
        const staleAsset = await screen.findByTestId('risk-asset-link-load-state');
        expect(screen.getByText('Payments gateway')).toBeInTheDocument();
        expect(within(staleAsset).getByRole('button', { name: /retry/i })).toBeInTheDocument();

        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockRejectedValue(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: ictRegisterKeys.riskProcessLinks(4) });
        });
        const deniedProcess = await screen.findByTestId('risk-process-link-load-state');
        expect(screen.queryByText('Settlement')).not.toBeInTheDocument();
        expect(screen.queryByTestId('risk-process-link-add')).not.toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(within(deniedProcess).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
        expect(screen.getByText('Payments gateway')).toBeInTheDocument();
    });

    it('closes an Asset reason dialog when that lane becomes denied', async () => {
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([{
            id: 71,
            risk_id: 4,
            asset_id: 11,
            asset_name: 'Payments gateway',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        fireEvent.click(await screen.findByTestId('risk-asset-link-remove-71'));
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();

        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockRejectedValue(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: ictRegisterKeys.riskAssetLinks(4) });
        });

        expect(await screen.findByTestId('risk-asset-link-load-state')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it.each([403, 404])('does not retry a protected-unavailable %i lane response', async (status) => {
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockRejectedValue(new ApiClientError({
            status,
            messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
        }));
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: 2, retryDelay: 1 }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        const denied = await screen.findByTestId('risk-process-link-load-state');
        expect(within(denied).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
        expect(riskRegisterLinksApi.getProcessLinks).toHaveBeenCalledTimes(1);
        expect(queryClient.getQueryData(ictRegisterKeys.riskProcessLinks(4))).toEqual([]);
    });

    it('purges one denied lane so a later 500 cannot re-expose its rows or actions', async () => {
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValueOnce([{
            id: 61,
            risk_id: 4,
            process_id: 9,
            process_name: 'Settlement',
            process_business_edit_blocked: false,
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        expect(await screen.findByText('Settlement')).toBeInTheDocument();

        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errorKeys.forbidden',
        }));
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: ictRegisterKeys.riskProcessLinks(4) });
        });
        expect(await screen.findByTestId('risk-process-link-load-state')).toBeInTheDocument();
        expect(queryClient.getQueryData(ictRegisterKeys.riskProcessLinks(4))).toEqual([]);

        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockRejectedValueOnce(new Error('later failure'));
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: ictRegisterKeys.riskProcessLinks(4) });
        });

        const failed = await screen.findByTestId('risk-process-link-load-state');
        expect(within(failed).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Settlement')).not.toBeInTheDocument();
        expect(screen.queryByTestId('risk-process-link-remove-61')).not.toBeInTheDocument();
        expect(queryClient.getQueryData(ictRegisterKeys.riskProcessLinks(4))).toEqual([]);
    });

    it('does not let a late Risk A approval navigate or leave dialog state on Risk B', async () => {
        const approval = deferred<Awaited<ReturnType<typeof riskRegisterLinksApi.removeAssetLink>>>();
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockImplementation(async (riskId) => [{
            id: riskId === 4 ? 71 : 72,
            risk_id: riskId,
            asset_id: riskId === 4 ? 11 : 12,
            asset_name: riskId === 4 ? 'Risk A asset' : 'Risk B asset',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.removeAssetLink).mockReturnValueOnce(approval.promise);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        const view = render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                    <LocationProbe />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        fireEvent.click(await screen.findByTestId('risk-asset-link-remove-71'));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Review Risk A' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: /continue/i }));
        await waitFor(() => expect(riskRegisterLinksApi.removeAssetLink).toHaveBeenCalledWith(4, 71, 'Review Risk A'));

        view.rerender(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 5 } as Risk} canManageLinks />
                    <LocationProbe />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        expect(await screen.findByText('Risk B asset')).toBeInTheDocument();

        await act(async () => approval.resolve({
            status: 'approval_required',
            message: 'Queued',
            approval_id: 199,
            action_type: 'edit',
            pending_fields: ['relationship'],
            proposal_id: 'proposal-risk-asset-199',
            proposal_version: 1,
        }));

        expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.queryByText(/link mutation failed/i)).not.toBeInTheDocument();
    });

    it('does not show a late Risk A mutation error on Risk B', async () => {
        const failure = deferred<Awaited<ReturnType<typeof riskRegisterLinksApi.removeAssetLink>>>();
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockImplementation(async (riskId) => [{
            id: riskId === 4 ? 71 : 72,
            risk_id: riskId,
            asset_id: riskId === 4 ? 11 : 12,
            asset_name: riskId === 4 ? 'Risk A asset' : 'Risk B asset',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.removeAssetLink).mockReturnValueOnce(failure.promise);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        const view = render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        fireEvent.click(await screen.findByTestId('risk-asset-link-remove-71'));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Review Risk A' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: /continue/i }));

        view.rerender(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 5 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );
        expect(await screen.findByText('Risk B asset')).toBeInTheDocument();
        await act(async () => failure.reject(new Error('late Risk A failure')));

        expect(screen.queryByText('The link could not be changed. Please try again.')).not.toBeInTheDocument();
        expect(screen.getByText('Risk B asset')).toBeInTheDocument();
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((accept, decline) => {
        resolve = accept;
        reject = decline;
    });
    return { promise, reject, resolve };
}

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}
