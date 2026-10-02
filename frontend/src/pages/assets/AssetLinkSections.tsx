import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Link2, Plus, Star, Workflow } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { LinkedItemList, LinkedItemRow, LinkRemoveButton } from '@/components/linking/LinkedItemList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
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
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import {
    processBusinessEditBlocked,
    processMutationRequiresApprovalReason,
} from '@/pages/processes/processProtectedEdit';

import { DetailSection } from '../detail/DetailSection';
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

type PendingProcessAction =
    | { kind: 'add' }
    | { kind: 'update'; processId: number }
    | { kind: 'remove'; processId: number };

export function AssetLinkSections({ asset, canManageLinks, onLinksChanged }: AssetLinkSectionsProps) {
    const { t } = useTranslation(['assets', 'common']);
    // D12 / PM-2: approval-routed link changes keep the user on the asset.
    const announceApprovalQueued = useApprovalQueued();
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);
    // FR-P4-8: the single removal awaiting confirmation across all three lists.
    const [pendingRemoval, setPendingRemoval] = useState<PendingLinkRemoval | null>(null);
    const [pendingProcessAction, setPendingProcessAction] = useState<PendingProcessAction | null>(null);
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
        onMutate: () => setLinkError(null),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingRemoval(null);
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
        onMutate: () => setLinkError(null),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingRemoval(null);
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
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

    const confirmRemoval = (reason?: string) => {
        if (!pendingRemoval) {
            return;
        }
        if (pendingRemoval.kind === 'asset') {
            removeAssetLink.mutate({ linkId: pendingRemoval.id, reason: reason?.trim() ?? '' });
        } else if (pendingRemoval.kind === 'vendor') {
            removeVendorLink.mutate({ linkId: pendingRemoval.id, reason: reason?.trim() ?? '' });
        }
    };

    const closeRemovalDialog = () => {
        setPendingRemoval(null);
        setLinkError(null);
    };

    const openProcessAction = (action: PendingProcessAction) => {
        setLinkError(null);
        setPendingProcessAction(action);
    };

    const openAssetAction = (action: 'asset_add' | 'vendor_add') => {
        setLinkError(null);
        setPendingAssetAction(action);
    };

    return (
        <>
            {/* A governed link dialog traps focus, so its rejected-mutation
                error is announced inside the dialog while it remains open. */}
            {linkError
                && pendingProcessAction === null
                && pendingAssetAction === null
                && pendingRemoval === null ? (
                <InlineMessage tone="danger">{linkError}</InlineMessage>
            ) : null}

            <DetailSection title={t('links.processes.title')} icon={Workflow}>
                <div className="space-y-4">
                    {processLinksQuery.isLoading ? (
                        <LoadingState layout="inline" />
                    ) : processLinksQuery.isError && !processLinksQuery.data ? (
                        // GAP-C-11: a failed load is an error with retry, never "no links".
                        <ErrorState layout="inline" onRetry={() => void processLinksQuery.refetch()} isRetrying={processLinksQuery.isFetching} />
                    ) : processLinks.length === 0 ? (
                        <EmptyState layout="inline" icon={null} title={t('links.processes.empty')} />
                    ) : (
                        <LinkedItemList testId="asset-process-links">
                            {processLinks.map((link) => {
                                const processActionBlocked = link.process_business_edit_blocked;
                                const primarySwapBlocked = !link.is_primary
                                    && currentPrimaryLink?.process_business_edit_blocked === true;
                                const processName = link.process_name ?? t('common:fallbacks.unknown_process');
                                const blockedReason = t('processes:pending_change.link_action_blocked');
                                return (
                                    <LinkedItemRow
                                        key={link.id}
                                        actions={canManageLinks ? (
                                            <>
                                                {!link.is_primary ? (
                                                    <Button
                                                        variant="outline"
                                                        size="compact"
                                                        data-testid={`asset-process-link-set-primary-${link.process_id}`}
                                                        disabled={processActionBlocked || primarySwapBlocked}
                                                        onClick={() => openProcessAction({
                                                            kind: 'update',
                                                            processId: link.process_id,
                                                        })}
                                                        title={(processActionBlocked || primarySwapBlocked)
                                                            ? blockedReason
                                                            : undefined}
                                                    >
                                                        {t('links.processes.set_primary')}
                                                    </Button>
                                                ) : null}
                                                <LinkRemoveButton
                                                    name={processName}
                                                    testId={`asset-process-link-remove-${link.process_id}`}
                                                    disabledReason={processActionBlocked ? blockedReason : undefined}
                                                    onClick={() => openProcessAction({
                                                        kind: 'remove',
                                                        processId: link.process_id,
                                                    })}
                                                />
                                            </>
                                        ) : undefined}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-bold text-foreground">{processName}</span>
                                            {link.is_primary ? (
                                                <Badge
                                                    tone="warning"
                                                    size="sm"
                                                    icon={Star}
                                                    data-testid={`asset-process-link-primary-${link.process_id}`}
                                                >
                                                    {t('links.processes.primary')}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {[link.significance, link.spof ? `${t('links.spof')}: ${link.spof}` : null]
                                                .filter(Boolean)
                                                .join(' · ') || t('links.processes.no_metadata')}
                                        </p>
                                        {processActionBlocked ? (
                                            <p className="mt-1 text-xs font-medium text-warning-text">
                                                {blockedReason}
                                            </p>
                                        ) : null}
                                    </LinkedItemRow>
                                );
                            })}
                        </LinkedItemList>
                    )}

                    {canManageLinks ? (
                        <div className="space-y-3 border-t border-border pt-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                <Field label={t('links.processes.select_label')} className="md:col-span-2">
                                    {(field) => (
                                        <SearchableEntitySelect
                                            {...field}
                                            value={processToLink}
                                            onValueChange={setProcessToLink}
                                            options={processOptions}
                                            placeholder={t('links.processes.select_placeholder')}
                                            searchValue={processSearch}
                                            onSearchChange={setProcessSearch}
                                            triggerTestId="asset-process-link-select"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.processes.significance')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={processLinkSignificance}
                                            onValueChange={setProcessLinkSignificance}
                                            options={listOptions.significances}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-process-link-significance"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.spof')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={processLinkSpof}
                                            onValueChange={setProcessLinkSpof}
                                            options={listOptions.yesNo}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-process-link-spof"
                                        />
                                    )}
                                </Field>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Field label={t('links.processes.primary')} layout="inline">
                                    {(field) => (
                                        <Checkbox
                                            {...field}
                                            data-testid="asset-process-link-is-primary"
                                            checked={processLinkIsPrimary}
                                            onCheckedChange={setProcessLinkIsPrimary}
                                        />
                                    )}
                                </Field>
                                <Button
                                    variant="accent"
                                    data-testid="asset-process-link-add"
                                    disabled={!processToLink || addProcessBlocked || addProcessLink.isPending}
                                    onClick={() => openProcessAction({ kind: 'add' })}
                                >
                                    <Plus aria-hidden="true" />
                                    {t('links.add')}
                                </Button>
                            </div>
                            {addProcessBlocked ? (
                                <p className="text-xs font-medium text-warning-text">
                                    {t('processes:pending_change.link_action_blocked')}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </DetailSection>

            <DetailSection title={t('links.assets.title')} icon={Link2}>
                <div className="space-y-4">
                    {assetLinksQuery.isLoading ? (
                        <LoadingState layout="inline" />
                    ) : assetLinksQuery.isError && !assetLinksQuery.data ? (
                        // GAP-C-11: a failed load is an error with retry, never "no links".
                        <ErrorState layout="inline" onRetry={() => void assetLinksQuery.refetch()} isRetrying={assetLinksQuery.isFetching} />
                    ) : assetLinks.length === 0 ? (
                        <EmptyState layout="inline" icon={null} title={t('links.assets.empty')} />
                    ) : (
                        <LinkedItemList testId="asset-asset-links">
                            {assetLinks.map((link) => {
                                const isDependent = link.dependent_asset_id === asset.id;
                                const otherAssetName = (isDependent
                                    ? link.supporting_asset_name
                                    : link.dependent_asset_name) ?? t('common:fallbacks.unknown_asset');
                                return (
                                    <LinkedItemRow
                                        key={link.id}
                                        actions={canManageLinks ? (
                                            <LinkRemoveButton
                                                name={otherAssetName}
                                                testId={`asset-asset-link-remove-${link.id}`}
                                                onClick={() => setPendingRemoval({
                                                    kind: 'asset',
                                                    id: link.id,
                                                    name: otherAssetName,
                                                })}
                                            />
                                        ) : undefined}
                                    >
                                        <span className="text-sm text-foreground">
                                            {t(isDependent ? 'links.assets.depends_on' : 'links.assets.supports')}{' '}
                                            <span className="font-bold text-foreground">{otherAssetName}</span>
                                        </span>
                                        <p className="text-xs text-muted-foreground">
                                            {[link.dependency_type, link.spof ? `${t('links.spof')}: ${link.spof}` : null]
                                                .filter(Boolean)
                                                .join(' · ') || t('links.assets.no_metadata')}
                                        </p>
                                    </LinkedItemRow>
                                );
                            })}
                        </LinkedItemList>
                    )}

                    {canManageLinks ? (
                        <div className="space-y-3 border-t border-border pt-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                <Field label={t('links.assets.direction_label')}>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={assetLinkDirection}
                                            onValueChange={(value) => setAssetLinkDirection(value as 'depends_on' | 'supports')}
                                            options={[
                                                { value: 'depends_on', label: t('links.assets.direction_depends_on') },
                                                { value: 'supports', label: t('links.assets.direction_supports') },
                                            ]}
                                            triggerTestId="asset-asset-link-direction"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.assets.select_label')} className="md:col-span-2">
                                    {(field) => (
                                        <SearchableEntitySelect
                                            {...field}
                                            value={assetToLink}
                                            onValueChange={setAssetToLink}
                                            options={assetOptions}
                                            placeholder={t('links.assets.select_placeholder')}
                                            searchValue={assetSearch}
                                            onSearchChange={setAssetSearch}
                                            triggerTestId="asset-asset-link-select"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.assets.dependency_type')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={assetLinkDependencyType}
                                            onValueChange={setAssetLinkDependencyType}
                                            options={listOptions.dependencyTypes}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-asset-link-dependency-type"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.spof')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={assetLinkSpof}
                                            onValueChange={setAssetLinkSpof}
                                            options={listOptions.yesNo}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-asset-link-spof"
                                        />
                                    )}
                                </Field>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    variant="accent"
                                    data-testid="asset-asset-link-add"
                                    disabled={!assetToLink || addAssetLink.isPending}
                                    onClick={() => openAssetAction('asset_add')}
                                >
                                    <Plus aria-hidden="true" />
                                    {t('links.add')}
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </DetailSection>

            <DetailSection title={t('links.vendors.title')} icon={Building2}>
                <div className="space-y-4">
                    {vendorLinksQuery.isLoading ? (
                        <LoadingState layout="inline" />
                    ) : vendorLinksQuery.isError && !vendorLinksQuery.data ? (
                        // GAP-C-11: a failed load is an error with retry, never "no links".
                        <ErrorState layout="inline" onRetry={() => void vendorLinksQuery.refetch()} isRetrying={vendorLinksQuery.isFetching} />
                    ) : vendorLinks.length === 0 ? (
                        <EmptyState layout="inline" icon={null} title={t('links.vendors.empty')} />
                    ) : (
                        <LinkedItemList testId="asset-vendor-links">
                            {vendorLinks.map((link) => {
                                const vendorName = assetVendorLinkRowName(link, t('common:fallbacks.unknown_vendor'));
                                return (
                                    <LinkedItemRow
                                        key={link.id}
                                        actions={canManageLinks && canDeleteAssetVendorLink(link) ? (
                                            <LinkRemoveButton
                                                name={vendorName}
                                                testId={`asset-vendor-link-remove-${link.id}`}
                                                onClick={() => setPendingRemoval({
                                                    kind: 'vendor',
                                                    id: link.id,
                                                    name: vendorName,
                                                })}
                                            />
                                        ) : undefined}
                                    >
                                        <span className="truncate text-sm font-bold text-foreground">{vendorName}</span>
                                        <p className="text-xs text-muted-foreground">
                                            {formatAssetVendorLinkMeta(link) || t('links.vendors.no_metadata')}
                                        </p>
                                    </LinkedItemRow>
                                );
                            })}
                        </LinkedItemList>
                    )}

                    {canManageLinks ? (
                        <div className="space-y-3 border-t border-border pt-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                                <Field label={t('links.vendors.select_label')}>
                                    {(field) => (
                                        <SearchableEntitySelect
                                            {...field}
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
                                    )}
                                </Field>
                                <Field label={t('links.vendors.s_code')} required>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={vendorLinkServiceCode}
                                            onValueChange={setVendorLinkServiceCode}
                                            options={ictServiceOptions}
                                            placeholder={t('links.vendors.s_code_placeholder')}
                                            triggerTestId="asset-vendor-link-s-code"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.vendors.role')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={vendorLinkRole}
                                            onValueChange={setVendorLinkRole}
                                            options={listOptions.vendorRoles}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-vendor-link-role"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.vendors.reliance')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={vendorLinkReliance}
                                            onValueChange={setVendorLinkReliance}
                                            options={listOptions.reliances}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-vendor-link-reliance"
                                        />
                                    )}
                                </Field>
                                <Field label={t('links.vendors.contract_ref')} optional>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={vendorLinkContractRef}
                                            onValueChange={setVendorLinkContractRef}
                                            options={contractRefOptions}
                                            allowEmpty
                                            emptyLabel={t('form.not_set')}
                                            placeholder={t('form.not_set')}
                                            triggerTestId="asset-vendor-link-contract-ref"
                                        />
                                    )}
                                </Field>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    variant="accent"
                                    data-testid="asset-vendor-link-add"
                                    disabled={!vendorLinkPayload || addVendorLink.isPending}
                                    onClick={() => openAssetAction('vendor_add')}
                                >
                                    <Plus aria-hidden="true" />
                                    {t('links.add')}
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </DetailSection>

            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                onClose={closeRemovalDialog}
                onConfirm={confirmRemoval}
                intent="unlink"
                entityName={pendingRemoval?.name}
                message={t('links.remove_confirm.message', { name: pendingRemoval?.name ?? '' })}
                reason="required"
                reasonLabel={t('form.request_reason')}
                reasonPlaceholder={t('form.request_reason_help')}
                isLoading={removeAssetLink.isPending || removeVendorLink.isPending}
                errorText={pendingRemoval ? linkError : null}
            />
            <GovernedMutationReasonDialog
                isOpen={pendingProcessAction !== null}
                reasonRequired={processReasonRequired}
                namespace="processes"
                kind={pendingProcessAction?.kind === 'remove'
                    ? 'link_remove'
                    : pendingProcessAction?.kind === 'update'
                        ? 'link_update'
                        : 'link_add'}
                isLoading={addProcessLink.isPending || setPrimaryProcess.isPending || removeProcessLink.isPending}
                errorText={linkError}
                onClose={() => {
                    setPendingProcessAction(null);
                    setLinkError(null);
                }}
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
                namespace="assets"
                kind="link_add"
                isLoading={addAssetLink.isPending || addVendorLink.isPending}
                errorText={linkError}
                onClose={() => {
                    setPendingAssetAction(null);
                    setLinkError(null);
                }}
                onConfirm={(reason) => {
                    if (pendingAssetAction === 'asset_add') addAssetLink.mutate(reason);
                    if (pendingAssetAction === 'vendor_add') addVendorLink.mutate(reason);
                }}
            />
        </>
    );
}
