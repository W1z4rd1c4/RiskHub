import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';

import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { LinkedItemList, LinkedItemRow, LinkRemoveButton } from '@/components/linking/LinkedItemList';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { isProcessApprovalQueuedResponse, type Process } from '@/types/process';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { processMutationRequiresApprovalReason } from '@/pages/processes/processProtectedEdit';

import { DetailSection } from '../detail/DetailSection';

import {
    buildProcessVendorLinkPayload,
    canDeleteProcessVendorLink,
    formatProcessVendorLinkMeta,
    processVendorLinkRowName,
} from './processVendorLinksPresentation';

interface ProcessVendorLinksSectionProps {
    process: Process;
    canManageLinks: boolean;
    onLinksChanged?: () => void | Promise<void>;
}

/** The manual Process<->Vendor Link relations (sheet 11 §1, issue #46). */
export function ProcessVendorLinksSection({ process, canManageLinks, onLinksChanged }: ProcessVendorLinksSectionProps) {
    const { t } = useTranslation(['processes', 'common']);
    // D12 / PM-2: approval-routed changes keep the user on this page with
    // the pending notice plus a success toast.
    const announceApprovalQueued = useApprovalQueued();
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<{ kind: 'add' } | { kind: 'remove'; linkId: number } | null>(null);

    const [vendorToLink, setVendorToLink] = useState('');
    const [serviceDescription, setServiceDescription] = useState('');
    const [vendorSearch, setVendorSearch] = useState('');
    const debouncedVendorSearch = useDebouncedValue(vendorSearch);

    const vendorLinksQuery = useQuery({
        queryKey: ictRegisterKeys.processVendorLinks(process.id),
        queryFn: () => processApi.getVendorLinks(process.id),
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
    });

    const refreshLinks = async () => {
        await queryClient.invalidateQueries({ queryKey: ictRegisterKeys.processVendorLinks(process.id) });
        await onLinksChanged?.();
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Process vendor link mutation failed:', mutationError);
        setLinkError(t('links.errors.mutation_failed'));
    };

    const linkPayload = buildProcessVendorLinkPayload({
        vendor_id: vendorToLink,
        direct_service_description: serviceDescription,
    });

    const addVendorLink = useMutation({
        mutationFn: (requestReason: string) => {
            if (!linkPayload) {
                return Promise.reject(new Error('Vendor is required'));
            }
            return processApi.addVendorLink(process.id, { ...linkPayload, request_reason: requestReason });
        },
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            setVendorToLink('');
            setServiceDescription('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeVendorLink = useMutation({
        mutationFn: ({ linkId, reason }: { linkId: number; reason: string }) =>
            processApi.removeVendorLink(process.id, linkId, reason),
        onSuccess: async (result) => {
            setLinkError(null);
            setPendingAction(null);
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const vendorLinks = vendorLinksQuery.data ?? [];
    const linkedVendorIds = new Set(vendorLinks.map((link) => link.vendor_id));
    const vendorOptions = (vendorOptionsQuery.data?.items ?? [])
        .filter((vendor) => !vendor.is_archived && !linkedVendorIds.has(vendor.id))
        .map((vendor) => ({ value: String(vendor.id), label: vendor.name }));

    return (
        <DetailSection title={t('links.vendors.title')} icon={Building2} testId="process-vendor-links-section">
            {linkError && pendingAction === null ? (
                <InlineMessage tone="danger" className="mb-4">{linkError}</InlineMessage>
            ) : null}

            <div className="space-y-4">
                {vendorLinksQuery.isLoading ? (
                    <LoadingState layout="inline" />
                ) : vendorLinksQuery.isError && !vendorLinksQuery.data ? (
                    // GAP-C-11: a failed load is an error with retry, never "no links".
                    <ErrorState layout="inline" onRetry={() => void vendorLinksQuery.refetch()} isRetrying={vendorLinksQuery.isFetching} />
                ) : vendorLinks.length === 0 ? (
                    <EmptyState layout="inline" icon={null} title={t('links.vendors.empty')} />
                ) : (
                    <LinkedItemList testId="process-vendor-links">
                        {vendorLinks.map((link) => {
                            const rowName = processVendorLinkRowName(link, t('common:fallbacks.unknown_vendor'));
                            return (
                                <LinkedItemRow
                                    key={link.id}
                                    actions={canManageLinks && canDeleteProcessVendorLink(link) ? (
                                        <LinkRemoveButton
                                            name={rowName}
                                            testId={`process-vendor-link-remove-${link.id}`}
                                            onClick={() => {
                                                setLinkError(null);
                                                setPendingAction({ kind: 'remove', linkId: link.id });
                                            }}
                                        />
                                    ) : undefined}
                                >
                                    <span className="truncate text-sm font-bold text-foreground">{rowName}</span>
                                    <p className="text-xs text-muted-foreground">
                                        {formatProcessVendorLinkMeta(link) || t('links.vendors.no_metadata')}
                                    </p>
                                </LinkedItemRow>
                            );
                        })}
                    </LinkedItemList>
                )}

                {canManageLinks ? (
                    <div className="grid grid-cols-1 items-end gap-3 border-t border-border pt-4 md:grid-cols-5">
                        <Field label={t('links.vendors.select_label')} className="md:col-span-2">
                            {(field) => (
                                <SearchableEntitySelect
                                    {...field}
                                    value={vendorToLink}
                                    onValueChange={setVendorToLink}
                                    options={vendorOptions}
                                    placeholder={t('links.vendors.select_placeholder')}
                                    searchValue={vendorSearch}
                                    onSearchChange={setVendorSearch}
                                    triggerTestId="process-vendor-link-select"
                                />
                            )}
                        </Field>
                        <Field label={t('links.vendors.description')} optional className="md:col-span-2">
                            {(field) => (
                                <Input
                                    {...field}
                                    type="text"
                                    data-testid="process-vendor-link-description"
                                    value={serviceDescription}
                                    onChange={(event) => setServiceDescription(event.target.value)}
                                />
                            )}
                        </Field>
                        <Button
                            variant="accent"
                            data-testid="process-vendor-link-add"
                            disabled={!linkPayload || addVendorLink.isPending}
                            onClick={() => {
                                setLinkError(null);
                                setPendingAction({ kind: 'add' });
                            }}
                        >
                            <Plus aria-hidden="true" />
                            {t('links.add')}
                        </Button>
                    </div>
                ) : null}
            </div>
            <GovernedMutationReasonDialog
                isOpen={pendingAction !== null}
                reasonRequired={processMutationRequiresApprovalReason(process)}
                namespace="processes"
                kind={pendingAction?.kind === 'remove' ? 'link_remove' : 'link_add'}
                isLoading={addVendorLink.isPending || removeVendorLink.isPending}
                errorText={linkError}
                onClose={() => {
                    setPendingAction(null);
                    setLinkError(null);
                }}
                onConfirm={(reason) => {
                    if (pendingAction?.kind === 'remove') {
                        removeVendorLink.mutate({ linkId: pendingAction.linkId, reason });
                    } else if (pendingAction?.kind === 'add') {
                        addVendorLink.mutate(reason);
                    }
                }}
            />
        </DetailSection>
    );
}
