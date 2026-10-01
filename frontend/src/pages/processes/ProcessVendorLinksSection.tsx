import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Unlink } from 'lucide-react';

import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { InlineMessage } from '@/components/ui/inline-message';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { isProcessApprovalQueuedResponse, type Process } from '@/types/process';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { processMutationRequiresApprovalReason } from '@/pages/processes/processProtectedEdit';

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
        <div className="glass-card space-y-5" data-testid="process-vendor-links-section">
            <div className="flex items-center gap-3 border-b border-border pb-4">
                <Building2 className="h-5 w-5 text-success-text" />
                <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    {t('links.vendors.title')}
                </h2>
            </div>

            {linkError && pendingAction === null ? (
                <InlineMessage tone="danger">{linkError}</InlineMessage>
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
                    <ul className="space-y-2" data-testid="process-vendor-links">
                        {vendorLinks.map((link) => (
                            <li
                                key={link.id}
                                className="flex flex-wrap items-center justify-between gap-3 bg-tint/5 border border-border rounded-xl px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <span className="text-sm font-bold text-foreground truncate">
                                        {processVendorLinkRowName(link, t('common:fallbacks.unknown_vendor'))}
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                        {formatProcessVendorLinkMeta(link) || t('links.vendors.no_metadata')}
                                    </p>
                                </div>
                                {canManageLinks && canDeleteProcessVendorLink(link) ? (
                                    <button
                                        type="button"
                                        data-testid={`process-vendor-link-remove-${link.id}`}
                                        onClick={() => {
                                            setLinkError(null);
                                            setPendingAction({ kind: 'remove', linkId: link.id });
                                        }}
                                        aria-label={t('common:links.remove_named', {
                                            name: processVendorLinkRowName(link, t('common:fallbacks.unknown_vendor')),
                                        })}
                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                        title={t('links.remove')}
                                    >
                                        <Unlink className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}

                {canManageLinks ? (
                    <div className="border-t border-border pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div className="md:col-span-2">
                            <SearchableEntitySelect
                                value={vendorToLink}
                                onValueChange={setVendorToLink}
                                options={vendorOptions}
                                placeholder={t('links.vendors.select_placeholder')}
                                searchValue={vendorSearch}
                                onSearchChange={setVendorSearch}
                                triggerTestId="process-vendor-link-select"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <input
                                type="text"
                                data-testid="process-vendor-link-description"
                                value={serviceDescription}
                                onChange={(event) => setServiceDescription(event.target.value)}
                                placeholder={t('links.vendors.description')}
                                className="w-full glass rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground bg-tint/5 border border-border focus:outline-none focus:border-accent/50"
                            />
                        </div>
                        <button
                            type="button"
                            data-testid="process-vendor-link-add"
                            disabled={!linkPayload || addVendorLink.isPending}
                            onClick={() => {
                                setLinkError(null);
                                setPendingAction({ kind: 'add' });
                            }}
                            className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-bold hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            {t('links.add')}
                        </button>
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
        </div>
    );
}
