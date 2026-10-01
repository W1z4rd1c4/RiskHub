import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { useAuthz } from '@/authz/useAuthz';
import { ArrowUpRight } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { InlineMessage } from '@/components/ui/inline-message';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { approvalsApi } from '@/services/approvalsApi';
import { vendorApi } from '@/services/vendorApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { EditBlockedState } from './detail/EditBlockedState';
import { PageHeader } from '@/components/layout/PageHeader';
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
        <InlineMessage tone="warning" title={t('ownership.pending_title')}>
            <div className="space-y-3">
                <p>{t('ownership.pending_help')}</p>
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
        </InlineMessage>
    );
}

export function VendorDetailPage({ mode = 'view' }: VendorDetailPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = resolveRegisterReturnTo(new URLSearchParams(location.search).get('return_to'), '/vendors');
    const vendorDetailPath = (vendorId: number) => appendRegisterReturnTo(`/vendors/${vendorId}`, returnTo);
    const { t } = useTranslation('vendors');
    const format = useFormat();
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
    const [archiveError, setArchiveError] = useState<string | null>(null);
    const [isCancellingPendingChange, setIsCancellingPendingChange] = useState(false);
    const [pendingCancellation, setPendingCancellation] = useState<{
        approvalId: number;
        targetName: string;
    } | null>(null);
    const [pendingCancellationError, setPendingCancellationError] = useState<string | null>(null);
    const feedback = useFeedback();
    const announceApprovalQueued = useApprovalQueued();
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
            setArchiveError(null);
            const result = await vendorApi.archiveVendor(vendor.id, requestReason?.trim() ?? '');
            setIsDeleteDialogOpen(false);
            if (isProcessApprovalQueuedResponse(result)) {
                // D12 / PM-2: stay on the vendor with the pending notice + toast.
                announceApprovalQueued({ approvalId: result.approval_id });
                void fetchVendor();
                return;
            }
            feedback.success({ title: tCommon('outcome.archived', { name: vendor.name }) });
            void navigate(returnTo);
        } catch (error) {
            logError('Failed to archive vendor:', error);
            setArchiveError(t('errors.archive_failed'));
        } finally {
            setIsDeleting(false);
        }
    };

    const openPendingChangeCancellation = () => {
        if (!vendor?.pending_change?.approval_id) return;
        setPendingCancellationError(null);
        setPendingCancellation({
            approvalId: vendor.pending_change.approval_id,
            targetName: vendor.name,
        });
    };

    const cancelPendingChange = async () => {
        if (!pendingCancellation || isCancellingPendingChange) return;
        try {
            setIsCancellingPendingChange(true);
            setPendingCancellationError(null);
            await approvalsApi.cancel(pendingCancellation.approvalId);
            setPendingCancellation(null);
            void fetchVendor();
        } catch (cancelError) {
            logError('Failed to cancel pending Vendor change:', cancelError);
            setPendingCancellationError(t('pending_change.cancel_failed'));
        } finally {
            setIsCancellingPendingChange(false);
        }
    };

    if (mode === 'new') {
        if (createGateState.state !== 'allowed') {
            // D7 / D14: the page title, back control and breadcrumbs stay in
            // place while the create capability loads or is denied.
            return (
                <div className="vendor-route">
                    <div className="vendor-page space-y-8">
                        <PageHeader
                            title={t('actions.new')}
                            description={t('subtitle')}
                            back={{ label: t('actions.back_to_register'), onClick: () => void navigate(returnTo) }}
                            breadcrumbs={[{ label: t('title'), to: returnTo }, { label: t('actions.new') }]}
                        />
                        <FormCapabilityGateState state={createGateState.state} onRetry={createGateState.retry} />
                    </div>
                </div>
            );
        }

        return (
            <VendorFormView
                mode="new"
                back={{ label: t('actions.back_to_register'), onClick: () => void navigate(returnTo) }}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: t('actions.new') }]}
                onSaved={(saved) => navigate(vendorDetailPath(saved.id))}
                onApprovalQueued={(queued) => announceApprovalQueued({ approvalId: queued.approval_id, to: returnTo })}
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
                backLabel={t('actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={vendorId === null ? undefined : () => void fetchVendor()}
            />
        );
    }

    const staleWarning = loadOutcome === 'stale-with-error' ? (
        <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchVendor()} />
    ) : null;
    const pendingCancellationDialog = (
        <PendingChangeCancellationDialog
            isOpen={pendingCancellation !== null}
            targetName={pendingCancellation?.targetName ?? ''}
            isLoading={isCancellingPendingChange}
            errorText={pendingCancellationError}
            onClose={() => {
                setPendingCancellation(null);
                setPendingCancellationError(null);
            }}
            onConfirm={() => void cancelPendingChange()}
        />
    );

    // D14 / AX-06: edit routes go back to the record and name it.
    const editBack = {
        label: tCommon('actions.back_to_detail', { name: vendor.name }),
        onClick: () => void navigate(vendorDetailPath(vendor.id)),
    };
    const editBreadcrumbs = [
        { label: t('title'), to: returnTo },
        { label: vendor.name, to: vendorDetailPath(vendor.id) },
        { label: t('actions.edit') },
    ];

    if (mode === 'edit') {
        if (resolveCapabilityFlag(vendor.capabilities, 'business_edit_blocked')) {
            return (
                <div className="vendor-route">
                    <div className="vendor-page">
                        <EditBlockedState
                            notice={staleWarning}
                            entityName={vendor.name}
                            documentTitle={tCommon('page_title.edit', { name: vendor.name })}
                            back={editBack}
                            breadcrumbs={editBreadcrumbs}
                            testId="vendor-edit-blocked"
                        >
                            {vendor.pending_change ? (
                                <VendorPendingChangePanel
                                    pendingChange={vendor.pending_change}
                                    locale={format.locale}
                                    cancelling={isCancellingPendingChange}
                                    onCancel={resolveCapabilityFlag(vendor.pending_change.capabilities, 'can_cancel')
                                        ? openPendingChangeCancellation
                                        : undefined}
                                />
                            ) : null}
                        </EditBlockedState>
                        {pendingCancellationDialog}
                    </div>
                </div>
            );
        }
        if (vendor.owner_orphaned) {
            return (
                <div className="vendor-route">
                    <div className="vendor-page space-y-8">
                        {staleWarning}
                        <PageHeader
                            title={t('actions.edit')}
                            description={vendor.name}
                            documentTitle={tCommon('page_title.edit', { name: vendor.name })}
                            back={editBack}
                            breadcrumbs={editBreadcrumbs}
                        />
                        <VendorOwnershipPendingMessage canViewGovernance={authz.canViewGovernance} />
                    </div>
                </div>
            );
        }
        if (canEdit !== true) {
            return (
                <div className="vendor-route">
                    <div className="vendor-page space-y-8">
                        <PageHeader
                            title={t('actions.edit')}
                            description={vendor.name}
                            documentTitle={tCommon('page_title.edit', { name: vendor.name })}
                            back={editBack}
                            breadcrumbs={editBreadcrumbs}
                        />
                        <FormCapabilityGateState state="denied" />
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {staleWarning}
                <VendorFormView
                    mode="edit"
                    vendor={vendor}
                    back={editBack}
                    breadcrumbs={editBreadcrumbs}
                    onSaved={(saved) => navigate(vendorDetailPath(saved.id))}
                    onApprovalQueued={(queued) => announceApprovalQueued({
                        approvalId: queued.approval_id,
                        to: vendorDetailPath(vendor.id),
                    })}
                    onCancel={() => navigate(vendorDetailPath(vendor.id))}
                />
            </div>
        );
    }

    return (
        <div className="vendor-route">
            <div className="vendor-page space-y-8">
                {staleWarning}
                <ApprovalQueuedNotice />

                {vendor.owner_orphaned ? (
                    <VendorOwnershipPendingMessage canViewGovernance={authz.canViewGovernance} />
                ) : null}

                {vendor.pending_change ? (
                    <VendorPendingChangePanel
                        pendingChange={vendor.pending_change}
                        locale={format.locale}
                        cancelling={isCancellingPendingChange}
                        onCancel={resolveCapabilityFlag(vendor.pending_change.capabilities, 'can_cancel')
                            ? openPendingChangeCancellation
                            : undefined}
                    />
                ) : null}

                <VendorDetailHeader
                    vendor={vendor}
                    canArchive={canArchive}
                    canEdit={canEdit}
                    canCreateIssue={canCreateIssue}
                    canRestore={canRestore}
                    onArchive={() => {
                        setArchiveError(null);
                        setIsDeleteDialogOpen(true);
                    }}
                    onBack={() => navigate(returnTo)}
                    registerHref={returnTo}
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

                {/* D10 / PM-1: the vendor API takes a reason; it is required
                    only when the archive is routed through approval. */}
                <ConfirmDialog
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={archiveVendor}
                    intent="archive"
                    entityLabel={tCommon('labels.vendor')}
                    message={t('messages.archive_confirm', { vendorName: vendor.name })}
                    isLoading={isDeleting}
                    reason={resolveCapabilityFlag(vendor.capabilities, 'protected_change_requires_approval')
                        ? 'required'
                        : 'optional'}
                    reasonLabel={t('form.request_reason')}
                    reasonPlaceholder={t('form.request_reason_help')}
                    errorText={archiveError}
                />
                {pendingCancellationDialog}
            </div>
        </div>
    );
}

export default VendorDetailPage;
