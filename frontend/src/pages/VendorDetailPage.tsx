import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { useAuthz } from '@/authz/useAuthz';
import { AlertCircle, ArrowUpRight, TriangleAlert, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { VendorInlineMessage } from '@/components/vendors/vendorRouteUi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { approvalsApi } from '@/services/approvalsApi';
import { vendorApi } from '@/services/vendorApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { VendorOverviewTab } from './vendors/VendorOverviewTab';
import { VendorDetailHeader } from './vendors/VendorDetailHeader';
import { VendorFormView } from './vendors/VendorFormView';
import { VendorPendingChangePanel } from './vendors/VendorPendingChangePanel';
import { useVendorDetailState } from './vendors/useVendorDetailState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { logError } from '@/services/logger';
import { type VendorDetailMode } from './vendors/vendorDetailPresentation';
import { VendorDetailLoadingState } from './vendors/VendorDetailStates';
import {
    useNormalizeLegacyVendorDetailSearch,
    useVendorDeepLinkScroll,
    useVendorFlashMessage,
} from './vendors/useVendorDetailPageEffects';

interface VendorDetailPageProps {
    mode?: VendorDetailMode;
}

interface VendorOwnershipPendingMessageProps {
    canViewGovernance: boolean;
}

function VendorOwnershipPendingMessage({ canViewGovernance }: VendorOwnershipPendingMessageProps) {
    const { t } = useTranslation('vendors');

    return (
        <VendorInlineMessage tone="warn">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-3">
                <p className="text-sm font-bold">{t('ownership.pending_title')}</p>
                <p className="text-sm">{t('ownership.pending_help')}</p>
                {canViewGovernance ? (
                    <Link
                        to="/governance?type=vendor"
                        className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest"
                    >
                        {t('ownership.resolve_in_governance')}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                ) : (
                    <p className="text-xs font-semibold">{t('ownership.ask_governance')}</p>
                )}
            </div>
        </VendorInlineMessage>
    );
}

export function VendorDetailPage({ mode = 'view' }: VendorDetailPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = resolveRegisterReturnTo(new URLSearchParams(location.search).get('return_to'), '/vendors');
    const vendorDetailPath = (vendorId: number) => appendRegisterReturnTo(`/vendors/${vendorId}`, returnTo);
    const { t, i18n } = useTranslation('vendors');
    const authz = useAuthz();

    const {
        canArchive,
        canCreateIssue,
        canCreateLinkedControl,
        canCreateLinkedKri,
        canCreateLinkedRisk,
        canEdit,
        canLinkControl,
        canLinkKri,
        canLinkRisk,
        canRestore,
        closeIssueModal,
        fetchVendor,
        isIssueModalOpen,
        isRetrying,
        loadOutcome,
        openIssueModal,
        restoreVendor,
        vendor,
        vendorId,
    } = useVendorDetailState({ mode });
    const { t: tCommon } = useTranslation('common');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCancellingPendingChange, setIsCancellingPendingChange] = useState(false);
    const { actionMessage, dismissActionMessage, setActionMessage } = useVendorFlashMessage(location, navigate);
    useNormalizeLegacyVendorDetailSearch(location, navigate);
    useVendorDeepLinkScroll(location);
    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => vendorApi.getVendors({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load vendor create capabilities.',
    });

    const archiveVendor = async (requestReason?: string) => {
        if (!vendor) {
            return;
        }
        try {
            setIsDeleting(true);
            const result = await vendorApi.archiveVendor(vendor.id, requestReason?.trim() ?? '');
            if (isProcessApprovalQueuedResponse(result)) {
                void navigate(`/approvals?tab=mine&approvalId=${result.approval_id}`);
                return;
            }
            void navigate(returnTo);
        } catch (error) {
            logError('Failed to archive vendor:', error);
            setActionMessage({
                tone: 'danger',
                message: t('errors.load_failed'),
            });
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    const cancelPendingChange = async () => {
        if (!vendor?.pending_change?.approval_id) return;
        try {
            setIsCancellingPendingChange(true);
            await approvalsApi.cancel(vendor.pending_change.approval_id);
            await fetchVendor();
        } catch (cancelError) {
            logError('Failed to cancel pending Vendor change:', cancelError);
            setActionMessage({
                tone: 'danger',
                message: t('pending_change.cancel_failed'),
            });
        } finally {
            setIsCancellingPendingChange(false);
        }
    };

    if (mode === 'new') {
        if (createGateState !== 'allowed') {
            return <FormCapabilityGateState state={createGateState} />;
        }

        return (
            <VendorFormView
                mode="new"
                onBack={() => navigate(returnTo)}
                onSaved={(saved) => navigate(vendorDetailPath(saved.id))}
                onApprovalQueued={(queued) => void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`)}
                onCancel={() => navigate(returnTo)}
            />
        );
    }

    if (loadOutcome === 'loading') {
        return <VendorDetailLoadingState />;
    }

    if (loadOutcome === 'unavailable' || !vendor) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('title')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={vendorId === null ? undefined : () => void fetchVendor()}
            />
        );
    }

    const staleWarning = loadOutcome === 'stale-with-error' ? (
        <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchVendor()} />
    ) : null;

    if (mode === 'edit') {
        if (resolveCapabilityFlag(vendor.capabilities, 'business_edit_blocked')) {
            return (
                <div className="vendor-route">
                    <div className="vendor-page space-y-8">
                        {staleWarning}
                        {vendor.pending_change ? (
                            <VendorPendingChangePanel
                                pendingChange={vendor.pending_change}
                                locale={i18n.language}
                                cancelling={isCancellingPendingChange}
                                onCancel={resolveCapabilityFlag(vendor.pending_change.capabilities, 'can_cancel')
                                    ? () => void cancelPendingChange()
                                    : undefined}
                            />
                        ) : null}
                        <button type="button" onClick={() => navigate(vendorDetailPath(vendor.id))} className="text-sm font-bold text-accent">
                            {t('actions.back_to_register')}
                        </button>
                    </div>
                </div>
            );
        }
        if (vendor.owner_orphaned) {
            return (
                <div className="vendor-route">
                    <div className="vendor-page space-y-6">
                        {staleWarning}
                        <VendorOwnershipPendingMessage canViewGovernance={authz.canViewGovernance} />
                        <button type="button" onClick={() => navigate(vendorDetailPath(vendor.id))} className="text-sm font-bold text-accent">
                            {t('actions.back_to_register')}
                        </button>
                    </div>
                </div>
            );
        }
        if (canEdit !== true) {
            return <FormCapabilityGateState state="denied" />;
        }

        return (
            <div className="space-y-6">
                {staleWarning}
                <VendorFormView
                    mode="edit"
                    vendor={vendor}
                    onBack={() => navigate(vendorDetailPath(vendor.id))}
                    onSaved={(saved) => navigate(vendorDetailPath(saved.id))}
                    onApprovalQueued={(queued) => void navigate(`/approvals?tab=mine&approvalId=${queued.approval_id}`)}
                    onCancel={() => navigate(vendorDetailPath(vendor.id))}
                />
            </div>
        );
    }

    return (
        <div className="vendor-route">
            <div className="vendor-page space-y-8">
                {staleWarning}
                {actionMessage && (
                <VendorInlineMessage tone={actionMessage.tone}>
                    {actionMessage.tone === 'warn' ? (
                        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">{actionMessage.message}</p>
                            {actionMessage.ctaHref && actionMessage.ctaLabel ? (
                                <Link
                                    to={actionMessage.ctaHref}
                                    className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
                                >
                                    {actionMessage.ctaLabel}
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={dismissActionMessage}
                            className="opacity-60 transition-opacity hover:opacity-100"
                        >
                            <XCircle className="h-4 w-4" />
                        </button>
                    </div>
                </VendorInlineMessage>
                )}

                {vendor.owner_orphaned ? (
                    <VendorOwnershipPendingMessage canViewGovernance={authz.canViewGovernance} />
                ) : null}

                {vendor.pending_change ? (
                    <VendorPendingChangePanel
                        pendingChange={vendor.pending_change}
                        locale={i18n.language}
                        cancelling={isCancellingPendingChange}
                        onCancel={resolveCapabilityFlag(vendor.pending_change.capabilities, 'can_cancel')
                            ? () => void cancelPendingChange()
                            : undefined}
                    />
                ) : null}

                <VendorDetailHeader
                    vendor={vendor}
                    canArchive={canArchive}
                    canEdit={canEdit}
                    canCreateIssue={canCreateIssue}
                    canRestore={canRestore}
                    onArchive={() => setIsDeleteDialogOpen(true)}
                    onBack={() => navigate(returnTo)}
                    onOpenIssueModal={openIssueModal}
                    onEdit={() => navigate(appendRegisterReturnTo(`/vendors/${vendor.id}/edit`, returnTo))}
                    onRestore={() => void restoreVendor()}
                />

                <VendorOverviewTab
                    vendor={vendor}
                    canLinkControl={canLinkControl}
                    canLinkKri={canLinkKri}
                    canLinkRisk={canLinkRisk}
                    canCreateControl={canCreateLinkedControl}
                    canCreateKri={canCreateLinkedKri}
                    canCreateRisk={canCreateLinkedRisk}
                    onAddControl={() => navigate(`/controls/new?vendor_id=${vendor.id}&return_to=${encodeURIComponent(vendorDetailPath(vendor.id))}`)}
                    onAddKri={() => navigate(`/kris/new?vendor_id=${vendor.id}&return_to=${encodeURIComponent(vendorDetailPath(vendor.id))}`)}
                    onAddRisk={() => navigate(`/risks/new?vendor_id=${vendor.id}&return_to=${encodeURIComponent(vendorDetailPath(vendor.id))}`)}
                    onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
                    onNavigateToKri={(kriId) => navigate(`/kris/${kriId}`)}
                    onNavigateToRisk={(riskId) => navigate(`/risks/${riskId}`)}
                />

                <IssueQuickCreateModal
                    isOpen={isIssueModalOpen}
                    onClose={closeIssueModal}
                    contextEntityType="vendor"
                    contextEntityId={vendor.id}
                    contextEntityLabel={vendor.name}
                    onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                />

                <ConfirmDialog
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={archiveVendor}
                    title={tCommon('actions.archive')}
                    message={t('messages.archive_confirm', { vendorName: vendor.name })}
                    confirmLabel={tCommon('actions.archive')}
                    variant="danger"
                    isLoading={isDeleting}
                    showInput
                    inputRequired
                    inputLabel={t('form.request_reason')}
                    inputPlaceholder={t('form.request_reason_help')}
                />
            </div>
        </div>
    );
}

export default VendorDetailPage;
