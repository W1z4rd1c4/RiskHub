import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetLinkSections } from '@/pages/assets/AssetLinkSections';
import { ProcessVendorLinksSection } from '@/pages/processes/ProcessVendorLinksSection';
import { VendorRegisterLinksSection } from '@/pages/vendors/VendorRegisterLinksSection';
import { ThreatRiskLinksSection } from '@/pages/threats/ThreatRiskLinksSection';
import { RiskRegisterLinksSection } from '@/components/risks/detail-overview/RiskRegisterLinksSection';
import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { threatApi, riskRegisterLinksApi } from '@/services/threatApi';
import type { Asset } from '@/types/asset';
import type { Process } from '@/types/process';
import type { Risk } from '@/types/risk';
import type { Threat } from '@/types/threat';

const feedback = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('@/hooks/useFeedback', () => ({ useFeedback: () => feedback }));
vi.mock('@/authz/useAuthz', () => ({ useAuthz: () => ({ can: () => true }) }));
vi.mock('@/services/assetApi', () => ({ assetApi: {
    getProcessLinks: vi.fn(), getAssetLinks: vi.fn().mockResolvedValue([]), getVendorLinks: vi.fn().mockResolvedValue([]),
    getAssets: vi.fn().mockResolvedValue({ items: [{ id: 7, capabilities: { protected_change_requires_approval: true } }] }),
    getAsset: vi.fn().mockResolvedValue({ capabilities: { protected_change_requires_approval: true } }),
    getClosedLists: vi.fn().mockResolvedValue({}), removeProcessLink: vi.fn(), removeVendorLink: vi.fn(),
} }));
vi.mock('@/services/processApi', () => ({ processApi: {
    getVendorLinks: vi.fn(), getProcesses: vi.fn().mockResolvedValue({ items: [] }), removeVendorLink: vi.fn(),
    getProcess: vi.fn().mockResolvedValue({ capabilities: { protected_change_requires_approval: true } }),
} }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: {
    getAssetLinks: vi.fn(), getProcessLinks: vi.fn().mockResolvedValue([]), getVendors: vi.fn().mockResolvedValue({ items: [] }),
    getVendor: vi.fn().mockResolvedValue({ capabilities: { protected_change_requires_approval: true } }),
} }));
vi.mock('@/services/vendorContractApi', () => ({ vendorContractApi: { getContracts: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/services/vendorSubOutsourcingApi', () => ({ vendorSubOutsourcingApi: { getIctServiceTaxonomy: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/services/riskApi', () => ({ riskApi: { getRisks: vi.fn().mockResolvedValue({ items: [] }) } }));
vi.mock('@/services/threatApi', () => ({
    threatApi: { getRiskLinks: vi.fn(), getThreats: vi.fn().mockResolvedValue({ items: [] }), removeRiskLink: vi.fn() },
    riskRegisterLinksApi: { getThreatLinks: vi.fn().mockResolvedValue([]), getProcessLinks: vi.fn().mockResolvedValue([]), getAssetLinks: vi.fn(), removeAssetLink: vi.fn() },
}));
const protectedCapabilities = { protected_change_requires_approval: true };
const rows = (owner: number) => [{ id: 41, threat_id: 7, asset_id: 7, process_id: 7, vendor_id: 7, risk_id: 7,
    asset_name: `Owner ${owner} counterpart`, process_name: `Owner ${owner} counterpart`,
    vendor_name: `Owner ${owner} counterpart`, risk_name: `Owner ${owner} counterpart`, risk_id_code: 'R-7',
    capabilities: { can_delete: true }, is_primary: false, process_business_edit_blocked: false,
    ict_service_code: 'S01', created_at: '2026-10-01T00:00:00Z' }];
const lanes = [
    { family: 'Asset', target: 'asset-process-link-remove-7', api: () => vi.spyOn(assetApi, 'removeProcessLink'), render: (id: number, changed: () => void) => <AssetLinkSections asset={{ id, capabilities: protectedCapabilities } as Asset} canManageLinks onLinksChanged={changed} /> },
    { family: 'Process', target: 'process-vendor-link-remove-41', api: () => vi.spyOn(processApi, 'removeVendorLink'), render: (id: number, changed: () => void) => <ProcessVendorLinksSection process={{ id, capabilities: protectedCapabilities } as Process} canManageLinks onLinksChanged={changed} /> },
    { family: 'Vendor', target: 'vendor-asset-link-remove-41', api: () => vi.spyOn(assetApi, 'removeVendorLink'), render: (id: number) => <VendorRegisterLinksSection vendorId={id} capabilities={{ ...protectedCapabilities, can_view_asset_links: true, can_manage_asset_links: true, can_manage_process_links: true }} /> },
    { family: 'Threat', target: 'threat-risk-link-remove-41', api: () => vi.spyOn(threatApi, 'removeRiskLink'), render: (id: number, changed: () => void) => <ThreatRiskLinksSection threat={{ id } as Threat} canManageLinks onLinksChanged={changed} /> },
    { family: 'Risk', target: 'risk-asset-link-remove-41', api: () => vi.spyOn(riskRegisterLinksApi, 'removeAssetLink'), render: (id: number) => <RiskRegisterLinksSection risk={{ id } as Risk} canManageLinks /> },
];
function LocationProbe() { const location = useLocation(); return <output data-testid="location-state">{JSON.stringify(location.state)}</output>; }
const pending = { status: 'approval_required', approval_id: 88, proposal_id: '10000000-0000-4000-8000-000000000088', proposal_version: 1, action_type: 'edit', pending_fields: ['relationship'], message: 'Queued' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(assetApi, 'getProcessLinks').mockImplementation((id) => Promise.resolve(rows(id)));
    vi.spyOn(processApi, 'getVendorLinks').mockImplementation((id) => Promise.resolve(rows(id)));
    vi.spyOn(vendorApi, 'getAssetLinks').mockImplementation((id) => Promise.resolve(rows(id)));
    vi.spyOn(threatApi, 'getRiskLinks').mockImplementation((id) => Promise.resolve(rows(id)));
    vi.spyOn(riskRegisterLinksApi, 'getAssetLinks').mockImplementation((id) => Promise.resolve(rows(id)));
});

describe.each(lanes)('$family link mutation owner', (lane) => {
    const cases = ['applied', 'rejected', ...(lane.family === 'Threat' ? [] : ['pending'])].flatMap((outcome) => ['switch', 'return', 'unmount'].map((transition) => ({ outcome, transition })));
    it.each(cases)('discards a late $outcome response after $transition', async ({ outcome, transition }) => {
        let resolve!: (value: never) => void;
        let reject!: (error: Error) => void;
        const response = new Promise<never>((res, rej) => { resolve = res; reject = rej; });
        lane.api().mockReturnValueOnce(response);
        const changed = vi.fn();
        const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        const tree = (id: number) => <QueryClientProvider client={client}><MemoryRouter>{lane.render(id, changed)}<LocationProbe /></MemoryRouter></QueryClientProvider>;
        const view = render(tree(1));
        fireEvent.click(await screen.findByTestId(lane.target));
        const dialog = screen.getByRole('alertdialog');
        const reason = within(dialog).queryByRole('textbox');
        if (reason) fireEvent.change(reason, { target: { value: 'Owner A rationale' } });
        fireEvent.submit(dialog.querySelector('form')!);
        await waitFor(() => expect(lane.api()).toHaveBeenCalledOnce());
        view.rerender(tree(2));
        await screen.findByText(/Owner 2 counterpart/);
        if (transition === 'return') {
            view.rerender(tree(1));
            await screen.findByText(/Owner 1 counterpart/);
        } else if (transition === 'unmount') {
            view.unmount();
            render(tree(2));
            await screen.findByText(/Owner 2 counterpart/);
        }
        feedback.success.mockClear();
        const invalidation = vi.spyOn(client, 'invalidateQueries');
        await act(() => {
            if (outcome === 'rejected') reject(new Error('Owner A rejection'));
            else resolve((outcome === 'pending' ? pending : undefined) as never);
            return Promise.resolve();
        });
        expect(screen.getByTestId('location-state')).not.toHaveTextContent('approvalQueued');
        expect(feedback.success).not.toHaveBeenCalled();
        expect(changed).not.toHaveBeenCalled();
        expect(invalidation).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('retains B rationale and busy ownership when A settles during B submission', async () => {
        let finishA!: (value: never) => void;
        let finishB!: (value: never) => void;
        lane.api().mockReturnValueOnce(new Promise((resolve) => { finishA = resolve; }))
            .mockReturnValueOnce(new Promise((resolve) => { finishB = resolve; }));
        const changed = vi.fn();
        const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        const tree = (id: number) => <QueryClientProvider client={client}><MemoryRouter>{lane.render(id, changed)}<LocationProbe /></MemoryRouter></QueryClientProvider>;
        const view = render(tree(1));
        fireEvent.click(await screen.findByTestId(lane.target));
        let dialog = screen.getByRole('alertdialog');
        const firstReason = within(dialog).queryByRole('textbox');
        if (firstReason) fireEvent.change(firstReason, { target: { value: 'Immutable owner A rationale' } });
        fireEvent.submit(dialog.querySelector('form')!);
        await waitFor(() => expect(lane.api()).toHaveBeenCalledOnce());
        view.rerender(tree(2));
        await screen.findByText(/Owner 2 counterpart/);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId(lane.target));
        dialog = screen.getByRole('alertdialog');
        const secondReason = within(dialog).queryByRole('textbox');
        if (secondReason) fireEvent.change(secondReason, { target: { value: 'Distinct owner B rationale' } });
        fireEvent.submit(dialog.querySelector('form')!);
        await waitFor(() => expect(lane.api()).toHaveBeenCalledTimes(2));
        await act(() => Promise.resolve(finishA((lane.family === 'Threat' ? undefined : pending) as never)));
        expect(screen.getByRole('alertdialog')).toBe(dialog);
        expect(dialog.querySelector('button[type="submit"]')).toBeDisabled();
        if (secondReason) expect(secondReason).toHaveValue('Distinct owner B rationale');
        expect(screen.getByTestId('location-state')).not.toHaveTextContent('approvalQueued');
        expect(changed).not.toHaveBeenCalled();
        if (lane.family !== 'Threat') {
            expect(lane.api().mock.calls[0].at(-1)).toBe('Immutable owner A rationale');
            expect(lane.api().mock.calls[1].at(-1)).toBe('Distinct owner B rationale');
        }
        await act(() => Promise.resolve(finishB(undefined as never)));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

});
