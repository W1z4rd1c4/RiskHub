/**
 * FR-P4-8 (P6): removing a link is a one-click destructive action, so it must
 * route through the governed reason dialog — nothing mutates until the user
 * supplies a reason and confirms, making a mis-click recoverable.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AssetApiModule from '@/services/assetApi';
import type * as ProcessApiModule from '@/services/processApi';
import type { Asset, AssetCapabilities, AssetDerived, ProcessAssetLink } from '@/types/asset';
import type { Process, ProcessCapabilities, ProcessDerived } from '@/types/process';

type AssetApi = typeof AssetApiModule.assetApi;
type ProcessApi = typeof ProcessApiModule.processApi;

vi.mock('@/services/assetApi', () => ({
    assetApi: assetApi,
}));

vi.mock('@/services/processApi', () => ({
    processApi: processApi,
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: { getVendors: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: { getContracts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/services/vendorSubOutsourcingApi', () => ({
    vendorSubOutsourcingApi: { getIctServiceTaxonomy: vi.fn().mockResolvedValue([]) },
}));

const assetApi = vi.hoisted(() => ({
    getProcessLinks: vi.fn<AssetApi['getProcessLinks']>(),
    getAssetLinks: vi.fn<AssetApi['getAssetLinks']>().mockResolvedValue([]),
    getVendorLinks: vi.fn<AssetApi['getVendorLinks']>().mockResolvedValue([]),
    getClosedLists: vi.fn<AssetApi['getClosedLists']>().mockResolvedValue({}),
    getAssets: vi.fn<AssetApi['getAssets']>().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
    addProcessLink: vi.fn<AssetApi['addProcessLink']>(),
    updateProcessLink: vi.fn<AssetApi['updateProcessLink']>(),
    removeProcessLink: vi.fn<AssetApi['removeProcessLink']>(),
    addAssetLink: vi.fn<AssetApi['addAssetLink']>(),
    removeAssetLink: vi.fn<AssetApi['removeAssetLink']>(),
    addVendorLink: vi.fn<AssetApi['addVendorLink']>(),
    removeVendorLink: vi.fn<AssetApi['removeVendorLink']>(),
}));
const processApi = vi.hoisted(() => ({
    getProcess: vi.fn<ProcessApi['getProcess']>(),
    getProcesses: vi.fn<ProcessApi['getProcesses']>(),
}));
const mockRemoveProcessLink = assetApi.removeProcessLink;
const mockRemoveAssetLink = assetApi.removeAssetLink;
import { AssetLinkSections } from '@/pages/assets/AssetLinkSections';
import i18n from '@/i18n';

const fixtureTimestamp = '2026-01-01T00:00:00Z';
const assetCapabilities: AssetCapabilities = {
    can_read: true,
    can_update: true,
    can_archive: false,
    can_restore: false,
    protected_change_requires_approval: true,
};
const processCapabilities: ProcessCapabilities = {
    can_read: true,
    can_update: true,
    can_archive: false,
    can_restore: false,
    protected_change_requires_approval: true,
    can_request_change: true,
    can_cancel_pending_change: false,
    has_pending_change: false,
    business_edit_blocked: false,
};

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 1,
        name: 'Current asset',
        business_owner_orphaned: false,
        ict_owner_orphaned: false,
        ownership_status: 'legacy_unassigned',
        is_archived: false,
        capabilities: assetCapabilities,
        created_at: fixtureTimestamp,
        updated_at: fixtureTimestamp,
        ...overrides,
    };
}

function makeProcessDerived(cif: ProcessDerived['cif']): ProcessDerived {
    return {
        cif,
        criticality_class: 'medium',
        bcm_check: 'ok',
        linked_asset_count: 1,
        linked_vendor_count: 0,
        is_complete: true,
        is_duplicate: false,
        transitive_vendor_links: [],
        inputs: {
            threshold_critical_score: 12,
            threshold_high_score: 8,
            threshold_medium_score: 4,
            mtpd_critical_hours: 24,
            mtpd_medium_hours: 72,
            criticality_class_source: 'score',
            cif_class_critical: false,
            cif_mtpd_within_critical: false,
            cif_any_impact_maximal: false,
            missing_for_completeness: [],
            manual_vendor_link_count: 0,
            transitive_vendor_pair_count: 0,
        },
    };
}

function makeProcess(overrides: Partial<Process> = {}): Process {
    return {
        id: 100,
        f_code: 'PROCESS-100',
        l0_area: 'Operations',
        l1_process: 'Payroll',
        owner_orphaned: false,
        ownership_status: 'legacy_unassigned',
        is_archived: false,
        capabilities: processCapabilities,
        derived: makeProcessDerived('yes'),
        created_at: fixtureTimestamp,
        updated_at: fixtureTimestamp,
        ...overrides,
    };
}

function processList(items: Process[]): Awaited<ReturnType<ProcessApi['getProcesses']>> {
    return { items, total: items.length, offset: 0, limit: 100, pending_creations: [] };
}

function makeProcessLink(overrides: Partial<ProcessAssetLink> = {}): ProcessAssetLink {
    return {
        id: 10,
        asset_id: 1,
        process_id: 100,
        process_name: 'Payroll',
        process_business_edit_blocked: false,
        is_primary: false,
        significance: null,
        spof: null,
        created_at: fixtureTimestamp,
        ...overrides,
    };
}

const nonCifAssetDerived: AssetDerived = {
    h_rank: 1,
    article8_classification: 'non_critical',
    cif: 'no',
    cif_process_count: 0,
    cif_process_names: [],
    spof: 'no',
    external_dependency: 'no',
    legacy: 'no',
    linked_process_count: 1,
    linked_vendor_count: 0,
    linked_asset_names: [],
    vendor_names: [],
    ict_service_codes: [],
    contract_references: [],
    is_complete: true,
    inputs: {
        reference_date: '2026-01-01',
        threshold_low_score: 1,
        threshold_medium_score: 2,
        threshold_high_score: 3,
        rank_primary_process_criticality: 1,
        rank_score_criticality: 1,
        rank_preliminary_criticality: 1,
        rank_business_criticality: 1,
        rank_cif_floor: 1,
        missing_for_completeness: [],
    },
};
const asset = makeAsset();

function renderSection(assetUnderTest: Asset = asset) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AssetLinkSections asset={assetUnderTest} canManageLinks />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveProcessLink.mockResolvedValue(undefined);
    mockRemoveAssetLink.mockResolvedValue(undefined);
    assetApi.getProcessLinks.mockResolvedValue([makeProcessLink()]);
    processApi.getProcesses.mockResolvedValue(processList([makeProcess()]));
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetLinkSections link removal (FR-P4-8 / P6)', () => {
    it('requires a reason and only removes the Process link after confirmation', async () => {
        renderSection();

        const removeButton = await screen.findByTestId('asset-process-link-remove-100');
        fireEvent.click(removeButton);

        // The click alone must not mutate — it only opens the confirm dialog.
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();

        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).getByText(i18n.t('processes:link_approval.link_remove.title'))).toBeInTheDocument();

        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Remove obsolete dependency' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('processes:link_approval.continue') }));
        await waitFor(() => expect(mockRemoveProcessLink).toHaveBeenCalledWith(
            1,
            100,
            'Remove obsolete dependency',
        ));
    });

    it('keeps a rejected Process-link mutation error inside the open dialog and allows recovery', async () => {
        mockRemoveProcessLink
            .mockRejectedValueOnce(Object.assign(new Error('reason rejected'), { status: 422 }))
            .mockResolvedValueOnce(undefined);
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));
        let dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'First governed reason' },
        });
        fireEvent.click(within(dialog).getByRole('button', {
            name: i18n.t('processes:link_approval.continue'),
        }));

        const dialogAlert = await within(dialog).findByRole('alert');
        expect(dialogAlert).toHaveTextContent(i18n.t('assets:links.errors.mutation_failed'));
        expect(within(dialog).getByRole('textbox', { name: /request reason/i }))
            .toHaveValue('First governed reason');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();

        dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Corrected governed reason' },
        });
        fireEvent.click(within(dialog).getByRole('button', {
            name: i18n.t('processes:link_approval.continue'),
        }));

        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(mockRemoveProcessLink).toHaveBeenNthCalledWith(2, 1, 100, 'Corrected governed reason');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not carry a dismissed Process-link error into another removal dialog', async () => {
        mockRemoveProcessLink.mockRejectedValueOnce(
            Object.assign(new Error('reason rejected'), { status: 422 }),
        );
        assetApi.getAssetLinks.mockResolvedValue([{
            id: 20,
            dependent_asset_id: 1,
            dependent_asset_name: 'Current asset',
            supporting_asset_id: 2,
            supporting_asset_name: 'Payments platform',
            dependency_type: null,
            spof: null,
            created_at: fixtureTimestamp,
        }]);
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));
        const rejectedDialog = screen.getByRole('alertdialog');
        fireEvent.change(within(rejectedDialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Rejected Process rationale' },
        });
        fireEvent.click(within(rejectedDialog).getByRole('button', {
            name: i18n.t('processes:link_approval.continue'),
        }));
        expect(await within(rejectedDialog).findByRole('alert')).toHaveTextContent(
            i18n.t('assets:links.errors.mutation_failed'),
        );

        fireEvent.click(within(rejectedDialog).getByRole('button', {
            name: i18n.t('common:actions.cancel'),
        }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

        fireEvent.click(await screen.findByTestId('asset-asset-link-remove-20'));
        expect(within(screen.getByRole('alertdialog')).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('names the icon-only Asset-link remove button after the linked asset (AX-01)', async () => {
        assetApi.getAssetLinks.mockResolvedValue([{
            id: 20,
            dependent_asset_id: 1,
            dependent_asset_name: 'Current asset',
            supporting_asset_id: 2,
            supporting_asset_name: 'Payments platform',
            dependency_type: null,
            spof: null,
            created_at: fixtureTimestamp,
        }]);
        renderSection();

        const remove = await screen.findByTestId('asset-asset-link-remove-20');
        expect(remove).toHaveAccessibleName(
            i18n.t('common:links.remove_named', { name: 'Payments platform' }),
        );
        expect(remove.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('announces a rejected Asset-link removal only inside its retained dialog', async () => {
        mockRemoveAssetLink.mockRejectedValueOnce(Object.assign(new Error('reason rejected'), { status: 422 }));
        assetApi.getAssetLinks.mockResolvedValue([{
            id: 20,
            dependent_asset_id: 1,
            dependent_asset_name: 'Current asset',
            supporting_asset_id: 2,
            supporting_asset_name: 'Payments platform',
            dependency_type: null,
            spof: null,
            created_at: fixtureTimestamp,
        }]);
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-asset-link-remove-20'));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Retain this rationale' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('assets:links.remove') }));

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(
            i18n.t('assets:links.errors.mutation_failed'),
        );
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(within(dialog).getByRole('textbox', { name: /request reason/i }))
            .toHaveValue('Retain this rationale');
    });

    it('keeps a rejected Asset-link addition error and rationale inside the dialog', async () => {
        vi.mocked(assetApi).getAssets.mockResolvedValue({
            items: [makeAsset({ id: 2, name: 'Payments platform' })],
            total: 1,
            offset: 0,
            limit: 100,
        });
        vi.mocked(assetApi).addAssetLink.mockRejectedValueOnce(
            Object.assign(new Error('reason rejected'), { status: 422 }),
        );
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-asset-link-select'));
        fireEvent.click(await screen.findByRole('option', { name: 'Payments platform' }));
        fireEvent.click(screen.getByTestId('asset-asset-link-add'));

        const dialog = screen.getByRole('alertdialog');
        const reason = within(dialog).getByRole('textbox', { name: /request reason/i });
        fireEvent.change(reason, { target: { value: 'Retain governed addition reason' } });
        fireEvent.click(within(dialog).getByRole('button', {
            name: i18n.t('assets:link_approval.continue'),
        }));

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(
            i18n.t('assets:links.errors.mutation_failed'),
        );
        expect(reason).toHaveValue('Retain governed addition reason');
        expect(screen.getAllByText(i18n.t('assets:links.errors.mutation_failed'))).toHaveLength(1);

        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));
        fireEvent.click(screen.getByTestId('asset-asset-link-add'));
        expect(within(screen.getByRole('alertdialog')).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('cancelling the dialog leaves the link untouched', async () => {
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));

        const dialog = screen.getByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();
    });

    it('keeps a denied counterpart unavailable and lets the user close without a mutation', async () => {
        vi.mocked(processApi).getProcesses.mockResolvedValue(processList([]));
        vi.mocked(processApi).getProcess.mockRejectedValueOnce({ status: 403 });
        renderSection(makeAsset({ capabilities: { ...assetCapabilities, protected_change_requires_approval: false } }));
        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));
        const dialog = screen.getByRole('alertdialog');
        await waitFor(() => expect(vi.mocked(processApi).getProcess).toHaveBeenCalledExactlyOnceWith(100));
        expect(within(dialog).getByRole('button', { name: i18n.t('common:actions.remove_link') })).toBeDisabled();
        expect(within(dialog).getByText(i18n.t('common:governed_mutation.capability_unavailable'))).toBeInTheDocument();
        fireEvent.submit(dialog.querySelector('form')!);
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('requires the displaced primary Process fact even when the new primary and Asset are unprotected', async () => {
        vi.mocked(assetApi).getProcessLinks.mockResolvedValue([
            makeProcessLink({ id: 10, process_id: 100, process_name: 'New primary', is_primary: false }),
            makeProcessLink({ id: 11, process_id: 900, process_name: 'Displaced primary', is_primary: true }),
        ]);
        vi.mocked(processApi).getProcesses.mockResolvedValue(processList([
            makeProcess({ capabilities: { ...processCapabilities, protected_change_requires_approval: false } }),
        ]));
        vi.mocked(processApi).getProcess.mockResolvedValueOnce(makeProcess({ id: 900 }));
        renderSection(makeAsset({ capabilities: { ...assetCapabilities, protected_change_requires_approval: false } }));
        fireEvent.click(await screen.findByTestId('asset-process-link-set-primary-100'));
        const dialog = screen.getByRole('alertdialog');
        const reason = await within(dialog).findByRole('textbox', { name: /request reason/i });
        expect(reason).toHaveAttribute('aria-required', 'true');
        expect(vi.mocked(processApi).getProcess).toHaveBeenCalledExactlyOnceWith(900);
        fireEvent.submit(dialog.querySelector('form')!);
        expect(vi.mocked(assetApi).updateProcessLink).not.toHaveBeenCalled();
    });

    it('confirms a directly applied non-protected link without forcing a discarded reason', async () => {
        processApi.getProcesses.mockResolvedValue(processList([makeProcess({
            derived: makeProcessDerived('no'),
            capabilities: { ...processCapabilities, protected_change_requires_approval: false },
        })]));
        renderSection(makeAsset({ capabilities: { ...assetCapabilities, protected_change_requires_approval: false } }));

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));
        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).queryByRole('textbox', { name: /request reason/i })).not.toBeInTheDocument();
        // D10: without an approval requirement the governed removal reads as a plain unlink.
        expect(dialog.querySelector('svg.lucide-unlink')).not.toBeNull();
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.remove_link') }));

        await waitFor(() => expect(mockRemoveProcessLink).toHaveBeenCalledWith(1, 100, ''));
    });

    it('requires a reason when the current Asset is protected and the linked Process is not', async () => {
        processApi.getProcesses.mockResolvedValue(processList([makeProcess({
            derived: makeProcessDerived('no'),
            capabilities: { ...processCapabilities, protected_change_requires_approval: false },
        })]));
        renderSection(makeAsset({ derived: nonCifAssetDerived }));

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));

        expect(within(screen.getByRole('alertdialog')).getByRole('textbox', {
            name: /request reason/i,
        })).toBeInTheDocument();
    });

    it('disables Process relationship actions while the authoritative impact lock is active', async () => {
        assetApi.getProcessLinks.mockResolvedValue([makeProcessLink({ process_business_edit_blocked: true })]);
        renderSection();

        // The icon-only remove action stays focusable (RowActionButton `disabledReason`):
        // it is inert through `aria-disabled` and explains why in its tooltip.
        const remove = await screen.findByTestId('asset-process-link-remove-100');
        expect(remove).toHaveAttribute('aria-disabled', 'true');
        expect(remove).toHaveAttribute('title', expect.stringMatching(/pending governed change/i));
        fireEvent.click(remove);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('asset-process-link-set-primary-100')).toBeDisabled();
        expect(screen.getByText(/pending governed change/i)).toBeInTheDocument();
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();
    });
});
