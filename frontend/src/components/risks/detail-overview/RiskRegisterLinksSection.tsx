import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Flame, Plus, Server, Trash2, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { riskRegisterLinksApi, threatApi } from '@/services/threatApi';
import type { Risk } from '@/types/risk';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { navigateToApprovalRequest } from '@/pages/approvals/approvalNavigation';
import { ApiClientError, isForbiddenApiError } from '@/services/apiClient';
import {
    processBusinessEditBlocked,
    processMutationRequiresApprovalReason,
} from '@/pages/processes/processProtectedEdit';

import {
    buildRegisterLinkOptions,
    canDeleteRegisterLink,
    parseRegisterLinkTargetId,
    registerLinkRowName,
} from './riskRegisterLinksPresentation';

interface RiskRegisterLinksSectionProps {
    risk: Risk;
    canManageLinks: boolean;
}

interface LinkBlockProps {
    icon: LucideIcon;
    iconClass: string;
    title: string;
    emptyLabel: string;
    selectPlaceholder: string;
    addLabel: string;
    removeLabel: string;
    testIdPrefix: string;
    canManageLinks: boolean;
    rows: Array<{ id: number; name: string; canDelete: boolean; processEditBlocked?: boolean }>;
    options: Array<{ value: string; label: string; disabled?: boolean }>;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onAdd: (targetId: number) => void;
    onRemove: (linkId: number) => void;
    isAddPending: boolean;
    processBlockedLabel?: string;
}

interface LinkLaneProps<T> {
    children: ReactNode;
    isProtectedUnavailable: boolean;
    query: UseQueryResult<T>;
    testId: string;
}

function isProtectedUnavailableError(error: unknown): boolean {
    return isForbiddenApiError(error) || error instanceof ApiClientError && error.status === 404;
}

function useRegisterLinkLane<T>(
    ownerId: number,
    queryKey: readonly unknown[],
    request: (signal: AbortSignal) => Promise<T>,
) {
    const queryClient = useQueryClient();
    const [denied, setDenied] = useState(false);
    const unavailableRef = useRef(false);
    const recoveredOwnerRef = useRef<number | null>(null);
    const query = useQuery({
        queryKey,
        queryFn: async ({ signal }) => {
            try {
                return await request(signal);
            } catch (error) {
                if (isProtectedUnavailableError(error)) {
                    queryClient.setQueryData(queryKey, []);
                }
                throw error;
            }
        },
        retry: false,
    });
    const isProtectedUnavailable = denied
        || query.isError && isProtectedUnavailableError(query.error);

    useEffect(() => {
        setDenied(false);
        unavailableRef.current = false;
        recoveredOwnerRef.current = null;
    }, [ownerId]);

    const { data, fetchStatus, isPending, refetch } = query;
    const needsCancelledReadReplacement = isPending
        && fetchStatus === 'idle'
        && data === undefined;

    useEffect(() => {
        if (!needsCancelledReadReplacement || recoveredOwnerRef.current === ownerId) return;
        recoveredOwnerRef.current = ownerId;
        void refetch();
    }, [needsCancelledReadReplacement, ownerId, refetch]);

    useEffect(() => {
        if (query.isError && isProtectedUnavailableError(query.error)) {
            setDenied(true);
        } else if (query.isSuccess) {
            setDenied(false);
        }
    }, [query.error, query.isError, query.isSuccess]);

    useEffect(() => {
        unavailableRef.current = isProtectedUnavailable;
    }, [isProtectedUnavailable]);

    return { isProtectedUnavailable, query, unavailableRef };
}

function LinkLane<T>({ children, isProtectedUnavailable, query, testId }: LinkLaneProps<T>) {
    const { t } = useTranslation('common');
    const hasCachedData = query.data !== undefined;

    if (query.isPending && !hasCachedData) {
        return (
            <div className="py-12 text-center text-sm text-muted-foreground" role="status">
                {t('common:loading.generic')}
            </div>
        );
    }

    if (isProtectedUnavailable || query.isError && !hasCachedData) {
        return (
            <TableErrorState
                testId={testId}
                message={t('common:errors.load_failed')}
                onRetry={isProtectedUnavailable ? undefined : () => void query.refetch()}
            />
        );
    }

    return (
        <>
            {query.isError ? (
                <TableErrorState
                    variant="banner"
                    testId={testId}
                    message={t('common:detail_load.stale_description')}
                    onRetry={() => void query.refetch()}
                    isRetrying={query.isFetching}
                />
            ) : null}
            {children}
        </>
    );
}

function LinkBlock({
    icon: Icon,
    iconClass,
    title,
    emptyLabel,
    selectPlaceholder,
    addLabel,
    removeLabel,
    testIdPrefix,
    canManageLinks,
    rows,
    options,
    searchValue,
    onSearchChange,
    onAdd,
    onRemove,
    isAddPending,
    processBlockedLabel,
}: LinkBlockProps) {
    const [targetToLink, setTargetToLink] = useState('');
    const targetId = parseRegisterLinkTargetId(targetToLink);
    const selectedTargetBlocked = options.some(
        (option) => option.value === targetToLink && option.disabled === true,
    );

    return (
        <div className="space-y-4" data-testid={`${testIdPrefix}-block`}>
            <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${iconClass}`} />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</h3>
            </div>
            {rows.length === 0 ? (
                <p className="text-xs text-slate-500">{emptyLabel}</p>
            ) : (
                <ul className="space-y-2" data-testid={`${testIdPrefix}-rows`}>
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5"
                        >
                            <span className="text-sm font-bold text-white truncate">{row.name}</span>
                            {row.processEditBlocked && processBlockedLabel ? (
                                <p className="text-xs font-medium text-warning-text">{processBlockedLabel}</p>
                            ) : null}
                            {canManageLinks && row.canDelete ? (
                                <button
                                    type="button"
                                    disabled={row.processEditBlocked}
                                    data-testid={`${testIdPrefix}-remove-${row.id}`}
                                    onClick={() => onRemove(row.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    title={row.processEditBlocked && processBlockedLabel
                                        ? processBlockedLabel
                                        : removeLabel}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            {canManageLinks ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="md:col-span-3">
                        <SearchableEntitySelect
                            value={targetToLink}
                            onValueChange={setTargetToLink}
                            options={options}
                            placeholder={selectPlaceholder}
                            searchValue={searchValue}
                            onSearchChange={onSearchChange}
                            triggerTestId={`${testIdPrefix}-select`}
                        />
                    </div>
                    <button
                        type="button"
                        data-testid={`${testIdPrefix}-add`}
                        disabled={targetId === null || selectedTargetBlocked || isAddPending}
                        onClick={() => {
                            if (targetId !== null) {
                                onAdd(targetId);
                                setTargetToLink('');
                            }
                        }}
                        className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-bold hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {addLabel}
                    </button>
                    {selectedTargetBlocked && processBlockedLabel ? (
                        <p className="md:col-span-4 text-xs font-medium text-warning-text">
                            {processBlockedLabel}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** ICT Register link sections on the Risk detail: Threats, Processes, Assets (issue #47). */
export function RiskRegisterLinksSection({ risk, canManageLinks }: RiskRegisterLinksSectionProps) {
    const { t } = useTranslation(['risks', 'common']);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);
    const [pendingProcessAction, setPendingProcessAction] = useState<
        { kind: 'add'; processId: number } | { kind: 'remove'; linkId: number } | null
    >(null);
    const [pendingAssetAction, setPendingAssetAction] = useState<
        { kind: 'add'; assetId: number } | { kind: 'remove'; linkId: number } | null
    >(null);
    const [threatSearch, setThreatSearch] = useState('');
    const [processSearch, setProcessSearch] = useState('');
    const [assetSearch, setAssetSearch] = useState('');
    const ownerRef = useRef<number | null>(risk.id);
    const debouncedThreatSearch = useDebouncedValue(threatSearch);
    const debouncedProcessSearch = useDebouncedValue(processSearch);
    const debouncedAssetSearch = useDebouncedValue(assetSearch);

    useEffect(() => {
        ownerRef.current = risk.id;
        setLinkError(null);
        setPendingProcessAction(null);
        setPendingAssetAction(null);

        return () => {
            ownerRef.current = null;
        };
    }, [risk.id]);

    const threatLinksLane = useRegisterLinkLane(
        risk.id,
        ictRegisterKeys.riskThreatLinks(risk.id),
        (signal) => riskRegisterLinksApi.getThreatLinks(risk.id, { signal }),
    );
    const processLinksLane = useRegisterLinkLane(
        risk.id,
        ictRegisterKeys.riskProcessLinks(risk.id),
        (signal) => riskRegisterLinksApi.getProcessLinks(risk.id, { signal }),
    );
    const assetLinksLane = useRegisterLinkLane(
        risk.id,
        ictRegisterKeys.riskAssetLinks(risk.id),
        (signal) => riskRegisterLinksApi.getAssetLinks(risk.id, { signal }),
    );
    const threatLinksQuery = threatLinksLane.query;
    const processLinksQuery = processLinksLane.query;
    const assetLinksQuery = assetLinksLane.query;
    const threatLinksProtectedUnavailable = threatLinksLane.isProtectedUnavailable;
    const processLinksProtectedUnavailable = processLinksLane.isProtectedUnavailable;
    const assetLinksProtectedUnavailable = assetLinksLane.isProtectedUnavailable;

    useEffect(() => {
        if (processLinksProtectedUnavailable) setPendingProcessAction(null);
    }, [processLinksProtectedUnavailable]);

    useEffect(() => {
        if (assetLinksProtectedUnavailable) setPendingAssetAction(null);
    }, [assetLinksProtectedUnavailable]);

    const threatOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.threatOptions(debouncedThreatSearch),
        queryFn: ({ signal }) =>
            threatApi.getThreats({
                offset: 0,
                limit: 100,
                search: debouncedThreatSearch.trim() || undefined,
            }, { signal }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });
    const processOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.processOptions(debouncedProcessSearch),
        queryFn: ({ signal }) =>
            processApi.getProcesses({
                offset: 0,
                limit: 100,
                search: debouncedProcessSearch.trim() || undefined,
            }, { signal }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });
    const assetOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.assetOptions(debouncedAssetSearch),
        queryFn: ({ signal }) =>
            assetApi.getAssets({
                offset: 0,
                limit: 100,
                search: debouncedAssetSearch.trim() || undefined,
            }, { signal }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });

    const handleMutationError = (mutationError: unknown, ownerId: number) => {
        if (ownerRef.current !== ownerId) return;
        logError('Risk register link mutation failed:', mutationError);
        setLinkError(t('register_links.errors.mutation_failed'));
    };

    const invalidateOwnedLinks = async (ownerId: number, queryKey: readonly unknown[]) => {
        if (ownerRef.current !== ownerId) return;
        setLinkError(null);
        await queryClient.invalidateQueries({ queryKey });
    };

    const addThreatLink = useMutation({
        mutationFn: ({ ownerId, threatId }: { ownerId: number; threatId: number }) =>
            riskRegisterLinksApi.addThreatLink(ownerId, threatId),
        onSuccess: (_result, { ownerId }) => {
            if (threatLinksLane.unavailableRef.current) return;
            return invalidateOwnedLinks(ownerId, ictRegisterKeys.riskThreatLinks(ownerId));
        },
        onError: (error, { ownerId }) => {
            if (!threatLinksLane.unavailableRef.current) handleMutationError(error, ownerId);
        },
    });
    const removeThreatLink = useMutation({
        mutationFn: ({ linkId, ownerId }: { linkId: number; ownerId: number }) =>
            riskRegisterLinksApi.removeThreatLink(ownerId, linkId),
        onSuccess: (_result, { ownerId }) => {
            if (threatLinksLane.unavailableRef.current) return;
            return invalidateOwnedLinks(ownerId, ictRegisterKeys.riskThreatLinks(ownerId));
        },
        onError: (error, { ownerId }) => {
            if (!threatLinksLane.unavailableRef.current) handleMutationError(error, ownerId);
        },
    });
    const addProcessLink = useMutation({
        mutationFn: ({ ownerId, processId, reason }: { ownerId: number; processId: number; reason: string }) =>
            riskRegisterLinksApi.addProcessLink(ownerId, processId, reason),
        onSuccess: async (result, { ownerId }) => {
            if (ownerRef.current !== ownerId || processLinksLane.unavailableRef.current) return;
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await invalidateOwnedLinks(ownerId, ictRegisterKeys.riskProcessLinks(ownerId));
        },
        onError: (error, { ownerId }) => {
            if (!processLinksLane.unavailableRef.current) handleMutationError(error, ownerId);
        },
    });
    const removeProcessLink = useMutation({
        mutationFn: ({ linkId, ownerId, reason }: { linkId: number; ownerId: number; reason: string }) =>
            riskRegisterLinksApi.removeProcessLink(ownerId, linkId, reason),
        onSuccess: async (result, { ownerId }) => {
            if (ownerRef.current !== ownerId || processLinksLane.unavailableRef.current) return;
            setPendingProcessAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await invalidateOwnedLinks(ownerId, ictRegisterKeys.riskProcessLinks(ownerId));
        },
        onError: (error, { ownerId }) => {
            if (!processLinksLane.unavailableRef.current) handleMutationError(error, ownerId);
        },
    });
    const addAssetLink = useMutation({
        mutationFn: ({ assetId, ownerId, reason }: { assetId: number; ownerId: number; reason: string }) =>
            riskRegisterLinksApi.addAssetLink(ownerId, assetId, reason),
        onSuccess: async (result, { ownerId }) => {
            if (ownerRef.current !== ownerId || assetLinksLane.unavailableRef.current) return;
            setPendingAssetAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await invalidateOwnedLinks(ownerId, ictRegisterKeys.riskAssetLinks(ownerId));
        },
        onError: (error, { ownerId }) => {
            if (!assetLinksLane.unavailableRef.current) handleMutationError(error, ownerId);
        },
    });
    const removeAssetLink = useMutation({
        mutationFn: ({ linkId, ownerId, reason }: { linkId: number; ownerId: number; reason: string }) =>
            riskRegisterLinksApi.removeAssetLink(ownerId, linkId, reason),
        onSuccess: async (result, { ownerId }) => {
            if (ownerRef.current !== ownerId || assetLinksLane.unavailableRef.current) return;
            setPendingAssetAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                navigateToApprovalRequest(navigate, result.approval_id);
                return;
            }
            await invalidateOwnedLinks(ownerId, ictRegisterKeys.riskAssetLinks(ownerId));
        },
        onError: (error, { ownerId }) => {
            if (!assetLinksLane.unavailableRef.current) handleMutationError(error, ownerId);
        },
    });

    const threatLinks = threatLinksQuery.data ?? [];
    const processLinks = processLinksQuery.data ?? [];
    const assetLinks = assetLinksQuery.data ?? [];
    const pendingProcessId = pendingProcessAction?.kind === 'add'
        ? pendingProcessAction.processId
        : processLinks.find((link) => link.id === pendingProcessAction?.linkId)?.process_id;
    const pendingProcess = processOptionsQuery.data?.items.find(
        (candidate) => candidate.id === pendingProcessId,
    );

    return (
        <div className="glass-card space-y-6" data-testid="risk-register-links-section">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('register_links.title')}
                </h2>
            </div>

            {linkError ? (
                <div className="border border-destructive/30 rounded-xl px-4 py-3 text-destructive text-sm font-medium">
                    {linkError}
                </div>
            ) : null}

            <LinkLane
                isProtectedUnavailable={threatLinksProtectedUnavailable}
                query={threatLinksQuery}
                testId="risk-threat-link-load-state"
            >
            <LinkBlock
                icon={Flame}
                iconClass="text-amber-400"
                title={t('register_links.threats.title')}
                emptyLabel={t('register_links.threats.empty')}
                selectPlaceholder={t('register_links.threats.select_placeholder')}
                addLabel={t('register_links.add')}
                removeLabel={t('register_links.remove')}
                testIdPrefix="risk-threat-link"
                canManageLinks={canManageLinks}
                rows={threatLinks.map((link) => ({
                    id: link.id,
                    name: registerLinkRowName(link.threat_name, t('common:fallbacks.unknown_threat')),
                    canDelete: canDeleteRegisterLink(link),
                }))}
                options={buildRegisterLinkOptions(
                    (threatOptionsQuery.data?.items ?? []).map((threat) => ({
                        id: threat.id,
                        label: threat.name,
                        isArchived: threat.is_archived,
                    })),
                    new Set(threatLinks.map((link) => link.threat_id)),
                )}
                searchValue={threatSearch}
                onSearchChange={setThreatSearch}
                onAdd={(threatId) => addThreatLink.mutate({ ownerId: risk.id, threatId })}
                onRemove={(linkId) => removeThreatLink.mutate({ linkId, ownerId: risk.id })}
                isAddPending={addThreatLink.isPending && addThreatLink.variables?.ownerId === risk.id}
            />
            </LinkLane>

            <LinkLane
                isProtectedUnavailable={processLinksProtectedUnavailable}
                query={processLinksQuery}
                testId="risk-process-link-load-state"
            >
            <LinkBlock
                icon={Workflow}
                iconClass="text-sky-400"
                title={t('register_links.processes.title')}
                emptyLabel={t('register_links.processes.empty')}
                selectPlaceholder={t('register_links.processes.select_placeholder')}
                addLabel={t('register_links.add')}
                removeLabel={t('register_links.remove')}
                testIdPrefix="risk-process-link"
                canManageLinks={canManageLinks}
                rows={processLinks.map((link) => ({
                    id: link.id,
                    name: registerLinkRowName(link.process_name, t('common:fallbacks.unknown_process')),
                    canDelete: canDeleteRegisterLink(link),
                    processEditBlocked: link.process_business_edit_blocked,
                }))}
                options={buildRegisterLinkOptions(
                    (processOptionsQuery.data?.items ?? []).map((process) => ({
                        id: process.id,
                        label: processBusinessEditBlocked(process)
                            ? `${process.l1_process} — ${t('processes:pending_change.badge')}`
                            : process.l1_process,
                        isArchived: process.is_archived,
                        disabled: processBusinessEditBlocked(process),
                    })),
                    new Set(processLinks.map((link) => link.process_id)),
                )}
                searchValue={processSearch}
                onSearchChange={setProcessSearch}
                onAdd={(processId) => setPendingProcessAction({ kind: 'add', processId })}
                onRemove={(linkId) => setPendingProcessAction({ kind: 'remove', linkId })}
                isAddPending={addProcessLink.isPending && addProcessLink.variables?.ownerId === risk.id}
                processBlockedLabel={t('processes:pending_change.link_action_blocked')}
            />
            </LinkLane>

            <LinkLane
                isProtectedUnavailable={assetLinksProtectedUnavailable}
                query={assetLinksQuery}
                testId="risk-asset-link-load-state"
            >
            <LinkBlock
                icon={Server}
                iconClass="text-emerald-400"
                title={t('register_links.assets.title')}
                emptyLabel={t('register_links.assets.empty')}
                selectPlaceholder={t('register_links.assets.select_placeholder')}
                addLabel={t('register_links.add')}
                removeLabel={t('register_links.remove')}
                testIdPrefix="risk-asset-link"
                canManageLinks={canManageLinks}
                rows={assetLinks.map((link) => ({
                    id: link.id,
                    name: registerLinkRowName(link.asset_name, t('common:fallbacks.unknown_asset')),
                    canDelete: canDeleteRegisterLink(link),
                }))}
                options={buildRegisterLinkOptions(
                    (assetOptionsQuery.data?.items ?? []).map((asset) => ({
                        id: asset.id,
                        label: asset.name,
                        isArchived: asset.is_archived,
                    })),
                    new Set(assetLinks.map((link) => link.asset_id)),
                )}
                searchValue={assetSearch}
                onSearchChange={setAssetSearch}
                onAdd={(assetId) => setPendingAssetAction({ kind: 'add', assetId })}
                onRemove={(linkId) => setPendingAssetAction({ kind: 'remove', linkId })}
                isAddPending={addAssetLink.isPending && addAssetLink.variables?.ownerId === risk.id}
            />
            </LinkLane>
            <GovernedMutationReasonDialog
                isOpen={pendingProcessAction !== null && !processLinksProtectedUnavailable}
                reasonRequired={processMutationRequiresApprovalReason(pendingProcess)}
                namespace="processes"
                kind={pendingProcessAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={
                    addProcessLink.isPending && addProcessLink.variables?.ownerId === risk.id
                    || removeProcessLink.isPending && removeProcessLink.variables?.ownerId === risk.id
                }
                onClose={() => setPendingProcessAction(null)}
                onConfirm={(reason) => {
                    if (processLinksProtectedUnavailable) return;
                    if (pendingProcessAction?.kind === 'add') {
                        addProcessLink.mutate({ ownerId: risk.id, processId: pendingProcessAction.processId, reason });
                    } else if (pendingProcessAction?.kind === 'remove') {
                        removeProcessLink.mutate({ linkId: pendingProcessAction.linkId, ownerId: risk.id, reason });
                    }
                }}
            />
            <GovernedMutationReasonDialog
                isOpen={pendingAssetAction !== null && !assetLinksProtectedUnavailable}
                reasonRequired
                namespace="assets"
                kind={pendingAssetAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={
                    addAssetLink.isPending && addAssetLink.variables?.ownerId === risk.id
                    || removeAssetLink.isPending && removeAssetLink.variables?.ownerId === risk.id
                }
                onClose={() => setPendingAssetAction(null)}
                onConfirm={(reason) => {
                    if (assetLinksProtectedUnavailable) return;
                    if (pendingAssetAction?.kind === 'add') {
                        addAssetLink.mutate({ assetId: pendingAssetAction.assetId, ownerId: risk.id, reason });
                    } else if (pendingAssetAction?.kind === 'remove') {
                        removeAssetLink.mutate({ linkId: pendingAssetAction.linkId, ownerId: risk.id, reason });
                    }
                }}
            />
        </div>
    );
}
