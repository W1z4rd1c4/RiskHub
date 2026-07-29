import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Trash2, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useAuthz } from '@/authz/useAuthz';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorSubOutsourcingApi } from '@/services/vendorSubOutsourcingApi';
import type { VendorCapabilities } from '@/types/vendor';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { navigateToApprovalRequest } from '@/pages/approvals/approvalNavigation';
import {
    processBusinessEditBlocked,
    processMutationRequiresApprovalReason,
} from '@/pages/processes/processProtectedEdit';

import {
    buildVendorAssetLinkRows,
    buildVendorProcessLinkRows,
} from './vendorRegisterLinksPresentation';

interface VendorRegisterLinksSectionProps {
    vendorId: number;
    capabilities?: Pick<
        VendorCapabilities,
        'can_view_asset_links' | 'can_manage_asset_links' | 'can_manage_process_links'
    > | null;
}

/**
 * The Vendor end of the ICT Register Link relations (issue #46): the Assets
 * that depend on this Vendor (sheet 10_VAD, typed by S-code) and the
 * Processes linked to it directly (sheet 11 §1). Backend collection-view
 * metadata controls whether each block is fetched; mutations call the
 * register-end routes and are gated separately by add and per-row capabilities.
 */
export function VendorRegisterLinksSection({ vendorId, capabilities }: VendorRegisterLinksSectionProps) {
    const { t } = useTranslation(['vendors', 'common']);
    const navigate = useNavigate();
    const authz = useAuthz();
    const queryClient = useQueryClient();
    const [sectionError, setSectionError] = useState<string | null>(null);
    const [pendingProcessAction, setPendingProcessAction] = useState<
        { kind: 'add' } | { kind: 'remove'; processId: number; linkId: number } | null
    >(null);
    const [pendingAssetAction, setPendingAssetAction] = useState<
        { kind: 'add' } | { kind: 'remove'; assetId: number; linkId: number } | null
    >(null);

    const [assetToLink, setAssetToLink] = useState('');
    const [assetLinkServiceCode, setAssetLinkServiceCode] = useState('');
    const [processToLink, setProcessToLink] = useState('');
    const [assetSearch, setAssetSearch] = useState('');
    const [processSearch, setProcessSearch] = useState('');
    const debouncedAssetSearch = useDebouncedValue(assetSearch);
    const debouncedProcessSearch = useDebouncedValue(processSearch);

    const backendCanViewAssetLinks = capabilities == null
        ? null
        : resolveCapabilityFlag(capabilities, 'can_view_asset_links');
    const backendCanManageAssetLinks = capabilities == null
        ? null
        : resolveCapabilityFlag(capabilities, 'can_manage_asset_links');
    const backendCanManageProcessLinks = capabilities == null
        ? null
        : resolveCapabilityFlag(capabilities, 'can_manage_process_links');
    const localCanReadAssetLinks = authz.can('read', 'assets');
    const localCanReadProcessLinks = authz.can('read', 'processes');
    const canReadAssetLinks = backendCanViewAssetLinks ?? localCanReadAssetLinks;
    const canReadProcessLinks = localCanReadProcessLinks || backendCanManageProcessLinks === true;
    const canManageAssetLinks = backendCanManageAssetLinks
        ?? (localCanReadAssetLinks && authz.can('write', 'assets'));
    const canManageProcessLinks = backendCanManageProcessLinks
        ?? (localCanReadProcessLinks && authz.can('write', 'processes'));

    const assetLinksQuery = useQuery({
        queryKey: ictRegisterKeys.vendorAssetLinks(vendorId),
        queryFn: () => vendorApi.getAssetLinks(vendorId),
        enabled: canReadAssetLinks,
    });
    const processLinksQuery = useQuery({
        queryKey: ictRegisterKeys.vendorProcessLinks(vendorId),
        queryFn: () => vendorApi.getProcessLinks(vendorId),
        enabled: canReadProcessLinks,
    });
    const assetOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.assetOptions(debouncedAssetSearch),
        queryFn: () =>
            assetApi.getAssets({
                offset: 0,
                limit: 100,
                search: debouncedAssetSearch.trim() || undefined,
            }),
        staleTime: 60_000,
        enabled: canManageAssetLinks,
    });
    const processOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.processOptions(debouncedProcessSearch),
        queryFn: () =>
            processApi.getProcesses({
                offset: 0,
                limit: 100,
                search: debouncedProcessSearch.trim() || undefined,
            }),
        staleTime: 60_000,
        enabled: canManageProcessLinks,
    });
    const taxonomyQuery = useQuery({
        queryKey: ictRegisterKeys.ictServiceTaxonomy(),
        queryFn: () => vendorSubOutsourcingApi.getIctServiceTaxonomy(),
        staleTime: 5 * 60_000,
        enabled: canManageAssetLinks,
    });

    const refreshLinks = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ictRegisterKeys.vendorAssetLinks(vendorId) }),
            queryClient.invalidateQueries({ queryKey: ictRegisterKeys.vendorProcessLinks(vendorId) }),
        ]);
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Vendor register link mutation failed:', mutationError);
        setSectionError(t('register_links.errors.mutation_failed'));
    };

    const addAssetLink = useMutation({
        mutationFn: (reason: string) =>
            assetApi.addVendorLink(Number(assetToLink), {
                vendor_id: vendorId,
                ict_service_code: assetLinkServiceCode,
                request_reason: reason,
            }),
        onSuccess: async (result) => {
            setSectionError(null);
            setPendingAssetAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            setAssetToLink('');
            setAssetLinkServiceCode('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeAssetLink = useMutation({
        mutationFn: ({ assetId, linkId, reason }: { assetId: number; linkId: number; reason: string }) =>
            assetApi.removeVendorLink(assetId, linkId, reason),
        onSuccess: async (result) => {
            setSectionError(null);
            setPendingAssetAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const addProcessLink = useMutation({
        mutationFn: (reason: string) => processApi.addVendorLink(Number(processToLink), {
            vendor_id: vendorId,
            request_reason: reason,
        }),
        onSuccess: async (result) => {
            setSectionError(null);
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            setProcessToLink('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeProcessLink = useMutation({
        mutationFn: ({ processId, linkId, reason }: { processId: number; linkId: number; reason: string }) =>
            processApi.removeVendorLink(processId, linkId, reason),
        onSuccess: async (result) => {
            setSectionError(null);
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    if (!canReadAssetLinks && !canReadProcessLinks) {
        return null;
    }

    const assetRows = buildVendorAssetLinkRows(
        assetLinksQuery.data ?? [],
        t('common:fallbacks.unknown_asset'),
    );
    const processRows = buildVendorProcessLinkRows(
        processLinksQuery.data ?? [],
        t('common:fallbacks.unknown_process'),
    );

    // Assets are NOT filtered by linked-ness: the same pair may carry several
    // typed services (the identity tuple is asset + vendor + S-code).
    const assetOptions = (assetOptionsQuery.data?.items ?? [])
        .filter((asset) => !asset.is_archived)
        .map((asset) => ({ value: String(asset.id), label: asset.name }));
    const linkedProcessIds = new Set(processRows.map((row) => row.link.process_id));
    const processOptions = (processOptionsQuery.data?.items ?? [])
        .filter((process) => !process.is_archived && !linkedProcessIds.has(process.id))
        .map((process) => ({
            value: String(process.id),
            label: `${process.l2_subprocess
                ? `${process.l1_process} – ${process.l2_subprocess}`
                : process.l1_process}${processBusinessEditBlocked(process)
                ? ` — ${t('processes:pending_change.badge')}`
                : ''}`,
            disabled: processBusinessEditBlocked(process),
        }));
    const pendingProcessId = pendingProcessAction?.kind === 'add'
        ? Number(processToLink)
        : pendingProcessAction?.processId;
    const pendingProcess = processOptionsQuery.data?.items.find(
        (candidate) => candidate.id === pendingProcessId,
    );
    const addProcessBlocked = processBusinessEditBlocked(
        processOptionsQuery.data?.items.find((candidate) => candidate.id === Number(processToLink)),
    );
    const ictServiceOptions = (taxonomyQuery.data ?? []).map((service) => ({
        value: service.code,
        label: `${service.code} — ${service.label}`,
    }));

    return (
        <div className="glass-card space-y-6" data-testid="vendor-register-links-section">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <Workflow className="h-5 w-5 text-accent" />
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('register_links.title')}
                </h2>
            </div>

            {sectionError ? (
                <div className="border border-rose-400/30 rounded-xl px-4 py-3 text-rose-300 text-sm font-medium">
                    {sectionError}
                </div>
            ) : null}

            {canReadAssetLinks ? (
                <div className="space-y-4" data-testid="vendor-asset-links-block">
                    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                        <Boxes className="h-4 w-4 text-indigo-400" />
                        {t('register_links.assets_title')}
                    </h3>
                    {assetRows.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('register_links.assets_empty')}</p>
                    ) : (
                        <ul className="space-y-2" data-testid="vendor-asset-links">
                            {assetRows.map((row) => (
                                <li
                                    key={row.link.id}
                                    className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <span className="text-sm font-bold text-white truncate">{row.name}</span>
                                        <p className="text-xs text-slate-500">
                                            {row.meta || t('register_links.no_metadata')}
                                        </p>
                                    </div>
                                    {row.canDelete ? (
                                        <button
                                            type="button"
                                            data-testid={`vendor-asset-link-remove-${row.link.id}`}
                                            onClick={() =>
                                                setPendingAssetAction({
                                                    kind: 'remove',
                                                    assetId: row.link.asset_id,
                                                    linkId: row.link.id,
                                                })
                                            }
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                            title={t('register_links.remove')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}

                    {canManageAssetLinks ? (
                        <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <div className="md:col-span-2">
                                <SearchableEntitySelect
                                    value={assetToLink}
                                    onValueChange={setAssetToLink}
                                    options={assetOptions}
                                    placeholder={t('register_links.select_asset_placeholder')}
                                    searchValue={assetSearch}
                                    onSearchChange={setAssetSearch}
                                    triggerTestId="vendor-asset-link-select"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <ThemedSelect
                                    value={assetLinkServiceCode}
                                    onValueChange={setAssetLinkServiceCode}
                                    options={ictServiceOptions}
                                    placeholder={t('register_links.s_code')}
                                    triggerTestId="vendor-asset-link-s-code"
                                />
                            </div>
                            <button
                                type="button"
                                data-testid="vendor-asset-link-add"
                                disabled={!assetToLink || !assetLinkServiceCode || addAssetLink.isPending}
                                onClick={() => setPendingAssetAction({ kind: 'add' })}
                                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                {t('register_links.add')}
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {canReadProcessLinks ? (
                <div className="space-y-4" data-testid="vendor-process-links-block">
                    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                        <Workflow className="h-4 w-4 text-emerald-400" />
                        {t('register_links.processes_title')}
                    </h3>
                    {processRows.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('register_links.processes_empty')}</p>
                    ) : (
                        <ul className="space-y-2" data-testid="vendor-process-links">
                            {processRows.map((row) => (
                                <li
                                    key={row.link.id}
                                    className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <span className="text-sm font-bold text-white truncate">{row.name}</span>
                                        <p className="text-xs text-slate-500">
                                            {row.meta || t('register_links.no_metadata')}
                                        </p>
                                        {row.processEditBlocked ? (
                                            <p className="mt-1 text-xs font-medium text-amber-300">
                                                {t('processes:pending_change.link_action_blocked')}
                                            </p>
                                        ) : null}
                                    </div>
                                    {row.canDelete ? (
                                        <button
                                            type="button"
                                            data-testid={`vendor-process-link-remove-${row.link.id}`}
                                            disabled={row.processEditBlocked}
                                            onClick={() =>
                                                setPendingProcessAction({ kind: 'remove',
                                                    processId: row.link.process_id,
                                                    linkId: row.link.id,
                                                })
                                            }
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                            title={row.processEditBlocked
                                                ? t('processes:pending_change.link_action_blocked')
                                                : t('register_links.remove')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}

                    {canManageProcessLinks ? (
                        <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <div className="md:col-span-4">
                                <SearchableEntitySelect
                                    value={processToLink}
                                    onValueChange={setProcessToLink}
                                    options={processOptions}
                                    placeholder={t('register_links.select_process_placeholder')}
                                    searchValue={processSearch}
                                    onSearchChange={setProcessSearch}
                                    triggerTestId="vendor-process-link-select"
                                />
                            </div>
                            <button
                                type="button"
                                data-testid="vendor-process-link-add"
                                disabled={!processToLink || addProcessBlocked || addProcessLink.isPending}
                                onClick={() => setPendingProcessAction({ kind: 'add' })}
                                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                {t('register_links.add')}
                            </button>
                            {addProcessBlocked ? (
                                <p className="md:col-span-5 text-xs font-medium text-amber-300">
                                    {t('processes:pending_change.link_action_blocked')}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <GovernedMutationReasonDialog
                isOpen={pendingProcessAction !== null}
                reasonRequired={processMutationRequiresApprovalReason(pendingProcess)}
                kind={pendingProcessAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={addProcessLink.isPending || removeProcessLink.isPending}
                onClose={() => setPendingProcessAction(null)}
                onConfirm={(reason) => {
                    if (pendingProcessAction?.kind === 'add') addProcessLink.mutate(reason);
                    if (pendingProcessAction?.kind === 'remove') {
                        removeProcessLink.mutate({ ...pendingProcessAction, reason });
                    }
                }}
            />
            <GovernedMutationReasonDialog
                isOpen={pendingAssetAction !== null}
                reasonRequired
                kind={pendingAssetAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={addAssetLink.isPending || removeAssetLink.isPending}
                onClose={() => setPendingAssetAction(null)}
                onConfirm={(reason) => {
                    if (pendingAssetAction?.kind === 'add') {
                        addAssetLink.mutate(reason);
                    } else if (pendingAssetAction?.kind === 'remove') {
                        removeAssetLink.mutate({ ...pendingAssetAction, reason });
                    }
                }}
            />
        </div>
    );
}
