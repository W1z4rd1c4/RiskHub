import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Workflow } from 'lucide-react';

import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { LinkedItemList, LinkedItemRow, LinkRemoveButton } from '@/components/linking/LinkedItemList';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useAuthz } from '@/authz/useAuthz';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { closedListLabel } from '@/lib/closedListLabels';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorSubOutsourcingApi } from '@/services/vendorSubOutsourcingApi';
import type { VendorCapabilities } from '@/types/vendor';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
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
    // D12 / PM-2: approval-routed changes keep the user on this page with
    // the pending notice plus a success toast.
    const announceApprovalQueued = useApprovalQueued();
    // D9: a direct link removal is confirmed with a success toast.
    const feedback = useFeedback();
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            feedback.success({ title: t('common:outcome.link_removed') });
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
                announceApprovalQueued({ approvalId: result.approval_id });
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
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            feedback.success({ title: t('common:outcome.link_removed') });
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
        // GAP-C-09 / PM-4: the role and reliance codes read in the user's language.
        (list, value) => closedListLabel(t, list, value),
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
        <Card as="section" className="space-y-6" data-testid="vendor-register-links-section">
            <CardHeader icon={Workflow} title={t('register_links.title')} className="mb-0" />

            {sectionError && pendingProcessAction === null && pendingAssetAction === null ? (
                <InlineMessage tone="danger">{sectionError}</InlineMessage>
            ) : null}

            {canReadAssetLinks ? (
                <div className="space-y-4" data-testid="vendor-asset-links-block">
                    <h3 className="text-eyebrow flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-accent-text" aria-hidden="true" />
                        {t('register_links.assets_title')}
                    </h3>
                    {assetLinksQuery.isLoading ? (
                        <LoadingState layout="inline" />
                    ) : assetLinksQuery.isError && !assetLinksQuery.data ? (
                        // GAP-C-03: a failed load is an error with retry, never "no linked items".
                        <ErrorState
                            layout="inline"
                            onRetry={() => void assetLinksQuery.refetch()}
                            isRetrying={assetLinksQuery.isFetching}
                        />
                    ) : assetRows.length === 0 ? (
                        <EmptyState layout="inline" icon={null} title={t('register_links.assets_empty')} />
                    ) : (
                        <LinkedItemList testId="vendor-asset-links">
                            {assetRows.map((row) => (
                                <LinkedItemRow
                                    key={row.link.id}
                                    actions={row.canDelete ? (
                                        <LinkRemoveButton
                                            name={row.name}
                                            testId={`vendor-asset-link-remove-${row.link.id}`}
                                            onClick={() => {
                                                setSectionError(null);
                                                setPendingAssetAction({
                                                    kind: 'remove',
                                                    assetId: row.link.asset_id,
                                                    linkId: row.link.id,
                                                });
                                            }}
                                        />
                                    ) : undefined}
                                >
                                    <span className="truncate text-sm font-bold text-foreground">{row.name}</span>
                                    <p className="text-xs text-muted-foreground">
                                        {row.meta || t('register_links.no_metadata')}
                                    </p>
                                </LinkedItemRow>
                            ))}
                        </LinkedItemList>
                    )}

                    {canManageAssetLinks ? (
                        <div className="grid grid-cols-1 items-end gap-3 border-t border-border pt-4 md:grid-cols-5">
                            <Field label={t('register_links.asset_label')} required className="md:col-span-2">
                                {(field) => (
                                    <SearchableEntitySelect
                                        {...field}
                                        value={assetToLink}
                                        onValueChange={setAssetToLink}
                                        options={assetOptions}
                                        placeholder={t('register_links.select_asset_placeholder')}
                                        searchValue={assetSearch}
                                        onSearchChange={setAssetSearch}
                                        triggerTestId="vendor-asset-link-select"
                                    />
                                )}
                            </Field>
                            <Field label={t('register_links.s_code')} required className="md:col-span-2">
                                {(field) => (
                                    <ThemedSelect
                                        {...field}
                                        value={assetLinkServiceCode}
                                        onValueChange={setAssetLinkServiceCode}
                                        options={ictServiceOptions}
                                        placeholder={t('register_links.s_code')}
                                        triggerTestId="vendor-asset-link-s-code"
                                    />
                                )}
                            </Field>
                            <Button
                                variant="accent"
                                data-testid="vendor-asset-link-add"
                                disabled={!assetToLink || !assetLinkServiceCode || addAssetLink.isPending}
                                onClick={() => {
                                    setSectionError(null);
                                    setPendingAssetAction({ kind: 'add' });
                                }}
                            >
                                <Plus aria-hidden="true" />
                                {t('register_links.add')}
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {canReadProcessLinks ? (
                <div className="space-y-4" data-testid="vendor-process-links-block">
                    <h3 className="text-eyebrow flex items-center gap-2">
                        <Workflow className="h-4 w-4 text-success-text" aria-hidden="true" />
                        {t('register_links.processes_title')}
                    </h3>
                    {processLinksQuery.isLoading ? (
                        <LoadingState layout="inline" />
                    ) : processLinksQuery.isError && !processLinksQuery.data ? (
                        // GAP-C-03: a failed load is an error with retry, never "no linked items".
                        <ErrorState
                            layout="inline"
                            onRetry={() => void processLinksQuery.refetch()}
                            isRetrying={processLinksQuery.isFetching}
                        />
                    ) : processRows.length === 0 ? (
                        <EmptyState layout="inline" icon={null} title={t('register_links.processes_empty')} />
                    ) : (
                        <LinkedItemList testId="vendor-process-links">
                            {processRows.map((row) => (
                                <LinkedItemRow
                                    key={row.link.id}
                                    actions={row.canDelete ? (
                                        <LinkRemoveButton
                                            name={row.name}
                                            testId={`vendor-process-link-remove-${row.link.id}`}
                                            disabledReason={row.processEditBlocked
                                                ? t('processes:pending_change.link_action_blocked')
                                                : undefined}
                                            onClick={() => {
                                                setSectionError(null);
                                                setPendingProcessAction({
                                                    kind: 'remove',
                                                    processId: row.link.process_id,
                                                    linkId: row.link.id,
                                                });
                                            }}
                                        />
                                    ) : undefined}
                                >
                                    <span className="truncate text-sm font-bold text-foreground">{row.name}</span>
                                    <p className="text-xs text-muted-foreground">
                                        {row.meta || t('register_links.no_metadata')}
                                    </p>
                                    {row.processEditBlocked ? (
                                        <p className="mt-1 text-xs font-medium text-warning-text">
                                            {t('processes:pending_change.link_action_blocked')}
                                        </p>
                                    ) : null}
                                </LinkedItemRow>
                            ))}
                        </LinkedItemList>
                    )}

                    {canManageProcessLinks ? (
                        <div className="grid grid-cols-1 items-end gap-3 border-t border-border pt-4 md:grid-cols-5">
                            <Field label={t('register_links.process_label')} required className="md:col-span-4">
                                {(field) => (
                                    <SearchableEntitySelect
                                        {...field}
                                        value={processToLink}
                                        onValueChange={setProcessToLink}
                                        options={processOptions}
                                        placeholder={t('register_links.select_process_placeholder')}
                                        searchValue={processSearch}
                                        onSearchChange={setProcessSearch}
                                        triggerTestId="vendor-process-link-select"
                                    />
                                )}
                            </Field>
                            <Button
                                variant="accent"
                                data-testid="vendor-process-link-add"
                                disabled={!processToLink || addProcessBlocked || addProcessLink.isPending}
                                onClick={() => {
                                    setSectionError(null);
                                    setPendingProcessAction({ kind: 'add' });
                                }}
                            >
                                <Plus aria-hidden="true" />
                                {t('register_links.add')}
                            </Button>
                            {addProcessBlocked ? (
                                <p className="md:col-span-5 text-xs font-medium text-warning-text">
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
                namespace="processes"
                kind={pendingProcessAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={addProcessLink.isPending || removeProcessLink.isPending}
                errorText={sectionError}
                onClose={() => {
                    setPendingProcessAction(null);
                    setSectionError(null);
                }}
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
                namespace="assets"
                kind={pendingAssetAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={addAssetLink.isPending || removeAssetLink.isPending}
                errorText={sectionError}
                onClose={() => {
                    setPendingAssetAction(null);
                    setSectionError(null);
                }}
                onConfirm={(reason) => {
                    if (pendingAssetAction?.kind === 'add') {
                        addAssetLink.mutate(reason);
                    } else if (pendingAssetAction?.kind === 'remove') {
                        removeAssetLink.mutate({ ...pendingAssetAction, reason });
                    }
                }}
            />
        </Card>
    );
}
