import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Link2, Plus, Star, Trash2, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorContractApi } from '@/services/vendorContractApi';
import { vendorSubOutsourcingApi } from '@/services/vendorSubOutsourcingApi';
import type { Asset } from '@/types/asset';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { navigateToApprovalRequest } from '@/pages/approvals/approvalNavigation';
import {
    processBusinessEditBlocked,
    processMutationRequiresApprovalReason,
} from '@/pages/processes/processProtectedEdit';

import {
    assetVendorLinkRowName,
    buildAssetVendorLinkPayload,
    canDeleteAssetVendorLink,
    formatAssetVendorLinkMeta,
} from './assetVendorLinksPresentation';

interface AssetLinkSectionsProps {
    asset: Asset;
    canManageLinks: boolean;
    onLinksChanged?: () => void | Promise<void>;
}

/**
 * A link-removal awaiting confirmation (FR-P4-8, P6). Removal is a one-click
 * destructive action, so it routes through the shared `ConfirmDialog` — a
 * mis-click is recoverable because nothing mutates until the user confirms.
 * `id` is the argument the matching remove-mutation expects (process link →
 * `process_id`; asset/vendor link → the link `id`).
 */
type PendingLinkRemoval =
    | { kind: 'process'; id: number; name: string }
    | { kind: 'asset'; id: number; name: string }
    | { kind: 'vendor'; id: number; name: string };

function sectionShell(
    icon: React.ReactNode,
    title: string,
    children: React.ReactNode,
) {
    return (
        <div className="glass-card space-y-5">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                {icon}
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">{title}</h2>
            </div>
            {children}
        </div>
    );
}

export function AssetLinkSections({ asset, canManageLinks, onLinksChanged }: AssetLinkSectionsProps) {
    const { t } = useTranslation(['assets', 'common']);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);
    // FR-P4-8: the single removal awaiting confirmation across all three lists.
    const [pendingRemoval, setPendingRemoval] = useState<PendingLinkRemoval | null>(null);
    const [pendingProcessAction, setPendingProcessAction] = useState<
        { kind: 'add' } | { kind: 'update'; processId: number } | { kind: 'remove'; processId: number } | null
    >(null);
    const [pendingAssetAction, setPendingAssetAction] = useState<'asset_add' | 'vendor_add' | null>(null);

    // Picker searches (server-driven; the empty search keeps the first page).
    const [processSearch, setProcessSearch] = useState('');
    const [assetSearch, setAssetSearch] = useState('');
    const [vendorSearch, setVendorSearch] = useState('');
    const debouncedProcessSearch = useDebouncedValue(processSearch);
    const debouncedAssetSearch = useDebouncedValue(assetSearch);
    const debouncedVendorSearch = useDebouncedValue(vendorSearch);

    // Add-form state: Process link.
    const [processToLink, setProcessToLink] = useState('');
    const [processLinkSignificance, setProcessLinkSignificance] = useState('');
    const [processLinkSpof, setProcessLinkSpof] = useState('');
    const [processLinkIsPrimary, setProcessLinkIsPrimary] = useState(false);

    // Add-form state: Asset link.
    const [assetLinkDirection, setAssetLinkDirection] = useState<'depends_on' | 'supports'>('depends_on');
    const [assetToLink, setAssetToLink] = useState('');
    const [assetLinkDependencyType, setAssetLinkDependencyType] = useState('');
    const [assetLinkSpof, setAssetLinkSpof] = useState('');

    // Add-form state: Vendor link (sheet 10_VAD).
    const [vendorToLink, setVendorToLink] = useState('');
    const [vendorLinkServiceCode, setVendorLinkServiceCode] = useState('');
    const [vendorLinkRole, setVendorLinkRole] = useState('');
    const [vendorLinkReliance, setVendorLinkReliance] = useState('');
    const [vendorLinkContractRef, setVendorLinkContractRef] = useState('');

    const processLinksQuery = useQuery({
        queryKey: ictRegisterKeys.assetProcessLinks(asset.id),
        queryFn: () => assetApi.getProcessLinks(asset.id),
    });
    const assetLinksQuery = useQuery({
        queryKey: ictRegisterKeys.assetAssetLinks(asset.id),
        queryFn: () => assetApi.getAssetLinks(asset.id),
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
        enabled: canManageLinks,
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
        enabled: canManageLinks,
    });
    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });
    const vendorLinksQuery = useQuery({
        queryKey: ictRegisterKeys.assetVendorLinks(asset.id),
        queryFn: () => assetApi.getVendorLinks(asset.id),
    });
    const vendorOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.vendorOptions(debouncedVendorSearch),
        queryFn: () =>
            vendorApi.getVendors({
                offset: 0,
                limit: 100,
                search: debouncedVendorSearch.trim() || undefined,
            }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });
    const taxonomyQuery = useQuery({
        queryKey: ictRegisterKeys.ictServiceTaxonomy(),
        queryFn: () => vendorSubOutsourcingApi.getIctServiceTaxonomy(),
        staleTime: 5 * 60_000,
    });
    const vendorContractsQuery = useQuery({
        queryKey: ictRegisterKeys.vendorContracts(Number(vendorToLink)),
        queryFn: () => vendorContractApi.getContracts(Number(vendorToLink)),
        enabled: vendorToLink !== '',
        staleTime: 60_000,
    });

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            significances: toOptions('VyznamVazby'),
            yesNo: toOptions('AnoNe'),
            dependencyTypes: toOptions('TypZavislostiAktiv'),
            vendorRoles: toOptions('RoleDodavatele'),
            reliances: toOptions('Reliance'),
        };
    }, [closedListsQuery.data]);

    const ictServiceOptions = useMemo(
        () =>
            (taxonomyQuery.data ?? []).map((service) => ({
                value: service.code,
                label: `${service.code} — ${service.label}`,
            })),
        [taxonomyQuery.data],
    );

    const contractRefOptions = useMemo(
        () =>
            (vendorContractsQuery.data ?? [])
                .filter((contract) => !contract.is_archived && contract.contract_reference)
                .map((contract) => ({
                    value: contract.contract_reference as string,
                    label: contract.contract_reference as string,
                })),
        [vendorContractsQuery.data],
    );
    const pendingProcessId = pendingProcessAction?.kind === 'add'
        ? Number(processToLink)
        : pendingProcessAction?.processId;
    const pendingProcessIds = new Set<number>();
    if (Number.isInteger(pendingProcessId) && Number(pendingProcessId) > 0) {
        pendingProcessIds.add(Number(pendingProcessId));
    }
    const changesPrimary = pendingProcessAction?.kind === 'update'
        || (pendingProcessAction?.kind === 'add' && processLinkIsPrimary);
    if (changesPrimary) {
        processLinksQuery.data
            ?.filter((link) => link.is_primary)
            .forEach((link) => pendingProcessIds.add(link.process_id));
    }
    const processReasonRequired = asset.derived?.cif === 'yes'
        || asset.derived?.resulting_criticality === 'critical'
        || [...pendingProcessIds].some((processId) =>
            processMutationRequiresApprovalReason(
                processOptionsQuery.data?.items.find((candidate) => candidate.id === processId),
            ));
    const selectedProcess = processOptionsQuery.data?.items.find(
        (candidate) => candidate.id === Number(processToLink),
    );

    const refreshLinks = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ictRegisterKeys.assetProcessLinks(asset.id) }),
            queryClient.invalidateQueries({ queryKey: ictRegisterKeys.assetAssetLinks(asset.id) }),
            queryClient.invalidateQueries({ queryKey: ictRegisterKeys.assetVendorLinks(asset.id) }),
        ]);
        await onLinksChanged?.();
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Asset link mutation failed:', mutationError);
        setLinkError(t('links.errors.mutation_failed'));
    };

    const addProcessLink = useMutation({
        mutationFn: (requestReason: string) =>
            assetApi.addProcessLink(asset.id, {
                process_id: Number(processToLink),
                significance: processLinkSignificance || null,
                spof: processLinkSpof || null,
                is_primary: processLinkIsPrimary,
                request_reason: requestReason,
            }),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            setProcessToLink('');
            setProcessLinkSignificance('');
            setProcessLinkSpof('');
            setProcessLinkIsPrimary(false);
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const setPrimaryProcess = useMutation({
        mutationFn: ({ processId, reason }: { processId: number; reason: string }) =>
            assetApi.updateProcessLink(asset.id, processId, { is_primary: true, request_reason: reason }),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeProcessLink = useMutation({
        mutationFn: ({ processId, reason }: { processId: number; reason: string }) =>
            assetApi.removeProcessLink(asset.id, processId, reason),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const addAssetLink = useMutation({
        mutationFn: (reason: string) =>
            assetApi.addAssetLink(asset.id, {
                dependent_asset_id: assetLinkDirection === 'depends_on' ? asset.id : Number(assetToLink),
                supporting_asset_id: assetLinkDirection === 'depends_on' ? Number(assetToLink) : asset.id,
                dependency_type: assetLinkDependencyType || null,
                spof: assetLinkSpof || null,
                request_reason: reason,
            }),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingAssetAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            setAssetToLink('');
            setAssetLinkDependencyType('');
            setAssetLinkSpof('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeAssetLink = useMutation({
        mutationFn: ({ linkId, reason }: { linkId: number; reason: string }) => assetApi.removeAssetLink(asset.id, linkId, reason),
        onSuccess: async (result) => {
            setLinkError(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const vendorLinkPayload = buildAssetVendorLinkPayload({
        vendor_id: vendorToLink,
        ict_service_code: vendorLinkServiceCode,
        vendor_role: vendorLinkRole,
        contract_reference: vendorLinkContractRef,
        reliance: vendorLinkReliance,
    });

    const addVendorLink = useMutation({
        mutationFn: (reason: string) => {
            if (!vendorLinkPayload) {
                return Promise.reject(new Error('Vendor and S-code are required'));
            }
            return assetApi.addVendorLink(asset.id, { ...vendorLinkPayload, request_reason: reason });
        },
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingAssetAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            setVendorToLink('');
            setVendorLinkServiceCode('');
            setVendorLinkRole('');
            setVendorLinkReliance('');
            setVendorLinkContractRef('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeVendorLink = useMutation({
        mutationFn: ({ linkId, reason }: { linkId: number; reason: string }) => assetApi.removeVendorLink(asset.id, linkId, reason),
        onSuccess: async (result) => {
            setLinkError(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const processLinks = processLinksQuery.data ?? [];
    const assetLinks = assetLinksQuery.data ?? [];
    const vendorLinks = vendorLinksQuery.data ?? [];

    const linkedProcessIds = new Set(processLinks.map((link) => link.process_id));
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
    const currentPrimaryLink = processLinks.find((link) => link.is_primary);
    const addProcessBlocked = processBusinessEditBlocked(selectedProcess)
        || (processLinkIsPrimary && currentPrimaryLink?.process_business_edit_blocked === true);
    const assetOptions = (assetOptionsQuery.data?.items ?? [])
        .filter((row) => !row.is_archived && row.id !== asset.id)
        .map((row) => ({ value: String(row.id), label: row.name }));
    const vendorOptions = (vendorOptionsQuery.data?.items ?? [])
        .filter((vendor) => !vendor.is_archived)
        .map((vendor) => ({ value: String(vendor.id), label: vendor.name }));

    // Run the confirmed removal, then close the dialog (optimistic close — the
    // mutation's own onSuccess/onError refreshes the list / surfaces the error).
    const confirmRemoval = (reason?: string) => {
        if (!pendingRemoval) {
            return;
        }
        if (pendingRemoval.kind === 'asset') {
            removeAssetLink.mutate({ linkId: pendingRemoval.id, reason: reason?.trim() ?? '' });
        } else if (pendingRemoval.kind === 'vendor') {
            removeVendorLink.mutate({ linkId: pendingRemoval.id, reason: reason?.trim() ?? '' });
        }
        setPendingRemoval(null);
    };

    return (
        <>
            {linkError ? (
                <div className="glass-card border border-rose-400/30 text-rose-300 text-sm font-medium">
                    {linkError}
                </div>
            ) : null}

            {sectionShell(
                <Workflow className="h-5 w-5 text-accent" />,
                t('links.processes.title'),
                <div className="space-y-4">
                    {processLinks.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('links.processes.empty')}</p>
                    ) : (
                        <ul className="space-y-2" data-testid="asset-process-links">
                            {processLinks.map((link) => {
                                const processActionBlocked = link.process_business_edit_blocked;
                                const primarySwapBlocked = !link.is_primary
                                    && currentPrimaryLink?.process_business_edit_blocked === true;
                                return (
                                <li
                                    key={link.id}
                                    className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white truncate">
                                                {link.process_name ?? t('common:fallbacks.unknown_process')}
                                            </span>
                                            {link.is_primary ? (
                                                <span
                                                    data-testid={`asset-process-link-primary-${link.process_id}`}
                                                    className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300"
                                                >
                                                    <Star className="h-3 w-3" />
                                                    {t('links.processes.primary')}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {[link.significance, link.spof ? `SPOF: ${link.spof}` : null]
                                                .filter(Boolean)
                                                .join(' · ') || t('links.processes.no_metadata')}
                                        </p>
                                        {processActionBlocked ? (
                                            <p className="mt-1 text-xs font-medium text-amber-300">
                                                {t('processes:pending_change.link_action_blocked')}
                                            </p>
                                        ) : null}
                                    </div>
                                    {canManageLinks ? (
                                        <div className="flex items-center gap-2">
                                            {!link.is_primary ? (
                                                <button
                                                    type="button"
                                                    data-testid={`asset-process-link-set-primary-${link.process_id}`}
                                                    disabled={processActionBlocked || primarySwapBlocked}
                                                    onClick={() => setPendingProcessAction({ kind: 'update', processId: link.process_id })}
                                                    title={(processActionBlocked || primarySwapBlocked)
                                                        ? t('processes:pending_change.link_action_blocked')
                                                        : undefined}
                                                    className="px-3 py-1.5 glass rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {t('links.processes.set_primary')}
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                data-testid={`asset-process-link-remove-${link.process_id}`}
                                                disabled={processActionBlocked}
                                                onClick={() =>
                                                    setPendingProcessAction({ kind: 'remove', processId: link.process_id })
                                                }
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                title={processActionBlocked
                                                    ? t('processes:pending_change.link_action_blocked')
                                                    : t('links.remove')}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : null}
                                </li>
                                );
                            })}
                        </ul>
                    )}

                    {canManageLinks ? (
                        <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <div className="md:col-span-2">
                                <SearchableEntitySelect
                                    value={processToLink}
                                    onValueChange={setProcessToLink}
                                    options={processOptions}
                                    placeholder={t('links.processes.select_placeholder')}
                                    searchValue={processSearch}
                                    onSearchChange={setProcessSearch}
                                    triggerTestId="asset-process-link-select"
                                />
                            </div>
                            <ThemedSelect
                                value={processLinkSignificance}
                                onValueChange={setProcessLinkSignificance}
                                options={listOptions.significances}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('links.processes.significance')}
                                triggerTestId="asset-process-link-significance"
                            />
                            <ThemedSelect
                                value={processLinkSpof}
                                onValueChange={setProcessLinkSpof}
                                options={listOptions.yesNo}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('links.spof')}
                                triggerTestId="asset-process-link-spof"
                            />
                            <div className="flex items-center gap-3">
                                <label htmlFor="asset-process-link-is-primary" className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                                    <input
                                        id="asset-process-link-is-primary"
                                        type="checkbox"
                                        data-testid="asset-process-link-is-primary"
                                        checked={processLinkIsPrimary}
                                        onChange={(event) => setProcessLinkIsPrimary(event.target.checked)}
                                        className="accent-amber-400"
                                    />
                                    {t('links.processes.primary')}
                                </label>
                                <button
                                    type="button"
                                    data-testid="asset-process-link-add"
                                    disabled={!processToLink || addProcessBlocked || addProcessLink.isPending}
                                    onClick={() => setPendingProcessAction({ kind: 'add' })}
                                    className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    {t('links.add')}
                                </button>
                            </div>
                            {addProcessBlocked ? (
                                <p className="md:col-span-5 text-xs font-medium text-amber-300">
                                    {t('processes:pending_change.link_action_blocked')}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}

            {sectionShell(
                <Link2 className="h-5 w-5 text-indigo-400" />,
                t('links.assets.title'),
                <div className="space-y-4">
                    {assetLinks.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('links.assets.empty')}</p>
                    ) : (
                        <ul className="space-y-2" data-testid="asset-asset-links">
                            {assetLinks.map((link) => {
                                const isDependent = link.dependent_asset_id === asset.id;
                                return (
                                    <li
                                        key={link.id}
                                        className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <span className="text-sm text-slate-300">
                                                {t(
                                                    isDependent
                                                        ? 'links.assets.depends_on'
                                                        : 'links.assets.supports',
                                                )}{' '}
                                                <span className="font-bold text-white">
                                                    {(isDependent
                                                        ? link.supporting_asset_name
                                                        : link.dependent_asset_name) ??
                                                        t('common:fallbacks.unknown_asset')}
                                                </span>
                                            </span>
                                            <p className="text-xs text-slate-500">
                                                {[link.dependency_type, link.spof ? `SPOF: ${link.spof}` : null]
                                                    .filter(Boolean)
                                                    .join(' · ') || t('links.assets.no_metadata')}
                                            </p>
                                        </div>
                                        {canManageLinks ? (
                                            <button
                                                type="button"
                                                data-testid={`asset-asset-link-remove-${link.id}`}
                                                onClick={() =>
                                                    setPendingRemoval({
                                                        kind: 'asset',
                                                        id: link.id,
                                                        name:
                                                            (isDependent
                                                                ? link.supporting_asset_name
                                                                : link.dependent_asset_name) ??
                                                            t('common:fallbacks.unknown_asset'),
                                                    })
                                                }
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                                title={t('links.remove')}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {canManageLinks ? (
                        <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <ThemedSelect
                                value={assetLinkDirection}
                                onValueChange={(value) => setAssetLinkDirection(value as 'depends_on' | 'supports')}
                                options={[
                                    { value: 'depends_on', label: t('links.assets.direction_depends_on') },
                                    { value: 'supports', label: t('links.assets.direction_supports') },
                                ]}
                                triggerTestId="asset-asset-link-direction"
                            />
                            <div className="md:col-span-2">
                                <SearchableEntitySelect
                                    value={assetToLink}
                                    onValueChange={setAssetToLink}
                                    options={assetOptions}
                                    placeholder={t('links.assets.select_placeholder')}
                                    searchValue={assetSearch}
                                    onSearchChange={setAssetSearch}
                                    triggerTestId="asset-asset-link-select"
                                />
                            </div>
                            <ThemedSelect
                                value={assetLinkDependencyType}
                                onValueChange={setAssetLinkDependencyType}
                                options={listOptions.dependencyTypes}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('links.assets.dependency_type')}
                                triggerTestId="asset-asset-link-dependency-type"
                            />
                            <div className="flex items-center gap-3">
                                <ThemedSelect
                                    value={assetLinkSpof}
                                    onValueChange={setAssetLinkSpof}
                                    options={listOptions.yesNo}
                                    allowEmpty
                                    emptyLabel={t('form.not_set')}
                                    placeholder={t('links.spof')}
                                    triggerTestId="asset-asset-link-spof"
                                />
                                <button
                                    type="button"
                                    data-testid="asset-asset-link-add"
                                    disabled={!assetToLink || addAssetLink.isPending}
                                    onClick={() => setPendingAssetAction('asset_add')}
                                    className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    {t('links.add')}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {sectionShell(
                <Building2 className="h-5 w-5 text-emerald-400" />,
                t('links.vendors.title'),
                <div className="space-y-4">
                    {vendorLinks.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('links.vendors.empty')}</p>
                    ) : (
                        <ul className="space-y-2" data-testid="asset-vendor-links">
                            {vendorLinks.map((link) => (
                                <li
                                    key={link.id}
                                    className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <span className="text-sm font-bold text-white truncate">
                                            {assetVendorLinkRowName(link, t('common:fallbacks.unknown_vendor'))}
                                        </span>
                                        <p className="text-xs text-slate-500">
                                            {formatAssetVendorLinkMeta(link) || t('links.vendors.no_metadata')}
                                        </p>
                                    </div>
                                    {canManageLinks && canDeleteAssetVendorLink(link) ? (
                                        <button
                                            type="button"
                                            data-testid={`asset-vendor-link-remove-${link.id}`}
                                            onClick={() =>
                                                setPendingRemoval({
                                                    kind: 'vendor',
                                                    id: link.id,
                                                    name: assetVendorLinkRowName(
                                                        link,
                                                        t('common:fallbacks.unknown_vendor'),
                                                    ),
                                                })
                                            }
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                            title={t('links.remove')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}

                    {canManageLinks ? (
                        <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                            <div className="md:col-span-2">
                                <SearchableEntitySelect
                                    value={vendorToLink}
                                    onValueChange={(value) => {
                                        setVendorToLink(value);
                                        setVendorLinkContractRef('');
                                    }}
                                    options={vendorOptions}
                                    placeholder={t('links.vendors.select_placeholder')}
                                    searchValue={vendorSearch}
                                    onSearchChange={setVendorSearch}
                                    triggerTestId="asset-vendor-link-select"
                                />
                            </div>
                            <ThemedSelect
                                value={vendorLinkServiceCode}
                                onValueChange={setVendorLinkServiceCode}
                                options={ictServiceOptions}
                                placeholder={t('links.vendors.s_code')}
                                triggerTestId="asset-vendor-link-s-code"
                            />
                            <ThemedSelect
                                value={vendorLinkRole}
                                onValueChange={setVendorLinkRole}
                                options={listOptions.vendorRoles}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('links.vendors.role')}
                                triggerTestId="asset-vendor-link-role"
                            />
                            <ThemedSelect
                                value={vendorLinkReliance}
                                onValueChange={setVendorLinkReliance}
                                options={listOptions.reliances}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('links.vendors.reliance')}
                                triggerTestId="asset-vendor-link-reliance"
                            />
                            <div className="flex items-center gap-3">
                                <ThemedSelect
                                    value={vendorLinkContractRef}
                                    onValueChange={setVendorLinkContractRef}
                                    options={contractRefOptions}
                                    allowEmpty
                                    emptyLabel={t('form.not_set')}
                                    placeholder={t('links.vendors.contract_ref')}
                                    triggerTestId="asset-vendor-link-contract-ref"
                                />
                                <button
                                    type="button"
                                    data-testid="asset-vendor-link-add"
                                    disabled={!vendorLinkPayload || addVendorLink.isPending}
                                    onClick={() => setPendingAssetAction('vendor_add')}
                                    className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    {t('links.add')}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                onClose={() => setPendingRemoval(null)}
                onConfirm={confirmRemoval}
                title={t('links.remove_confirm.title')}
                message={t('links.remove_confirm.message', { name: pendingRemoval?.name ?? '' })}
                confirmLabel={t('links.remove')}
                variant="danger"
                showInput
                inputRequired
                inputLabel={t('form.request_reason')}
                inputPlaceholder={t('form.request_reason_help')}
            />
            <GovernedMutationReasonDialog
                isOpen={pendingProcessAction !== null}
                reasonRequired={processReasonRequired}
                kind={pendingProcessAction?.kind === 'remove'
                    ? 'link_remove'
                    : pendingProcessAction?.kind === 'update'
                        ? 'link_update'
                        : 'link_add'}
                isLoading={addProcessLink.isPending || setPrimaryProcess.isPending || removeProcessLink.isPending}
                onClose={() => setPendingProcessAction(null)}
                onConfirm={(reason) => {
                    if (pendingProcessAction?.kind === 'add') addProcessLink.mutate(reason);
                    if (pendingProcessAction?.kind === 'update') {
                        setPrimaryProcess.mutate({ processId: pendingProcessAction.processId, reason });
                    }
                    if (pendingProcessAction?.kind === 'remove') {
                        removeProcessLink.mutate({ processId: pendingProcessAction.processId, reason });
                    }
                }}
            />
            <GovernedMutationReasonDialog
                isOpen={pendingAssetAction !== null}
                reasonRequired
                kind="link_add"
                isLoading={addAssetLink.isPending || addVendorLink.isPending}
                onClose={() => setPendingAssetAction(null)}
                onConfirm={(reason) => {
                    if (pendingAssetAction === 'asset_add') addAssetLink.mutate(reason);
                    if (pendingAssetAction === 'vendor_add') addVendorLink.mutate(reason);
                }}
            />
        </>
    );
}
