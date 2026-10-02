import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { useAuthz } from '@/authz/useAuthz';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { PendingChangePanel } from '@/components/approvals/PendingChangePanel';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { PageContainer } from '@/components/layout/PageContainer';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { approvalsApi } from '@/services/approvalsApi';
import { vendorApi } from '@/services/vendorApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { EditBlockedState } from './detail/EditBlockedState';
import { OwnershipGovernanceAlert } from './detail/OwnershipGovernanceAlert';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { VendorOverviewTab } from './vendors/VendorOverviewTab';
import { VendorDetailHeader } from './vendors/VendorDetailHeader';
import { VendorFormView } from './vendors/VendorFormView';
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
    onResolve: () => void;
    testId?: string;
}

/**
 * SM-05: the shared ownership banner. The governance action is offered only to
 * users who can open the Governance queue; everyone else is told whom to ask.
 */
function VendorOwnershipPendingMessage({ canViewGovernance, onResolve, testId }: VendorOwnershipPendingMessageProps) {
    const { t } = useTranslation('vendors');

    return (
        <OwnershipGovernanceAlert
            message={(
                <>
                    {t('ownership.pending_title')}
                    <span className="mt-1 block font-normal">{t('ownership.pending_help')}</span>
                    {canViewGovernance ? null : (
                        <span className="mt-1 block font-normal">{t('ownership.ask_governance')}</span>
                    )}
                </>
            )}
            actionLabel={t('ownership.resolve_in_governance')}
            onAction={canViewGovernance ? onResolve : undefined}
            testId={testId}
            actionTestId="vendor-orphan-governance"
        />
    );
}

export function VendorDetailPage({ mode = 'view' }: VendorDetailPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = resolveRegisterReturnTo(new URLSearchParams(location.search).get('return_to'), '/vendors');
    const vendorDetailPath = (vendorId: number) => appendRegisterReturnTo(`/vendors/${vendorId}`, returnTo);
    const { t } = useTranslation('vendors');
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
                <PageContainer size="form">
                    <PageHeader
                        title={t('actions.new')}
                        description={t('subtitle')}
                        back={{ label: t('actions.back_to_register'), onClick: () => void navigate(returnTo) }}
                        breadcrumbs={[{ label: t('title'), to: returnTo }, { label: t('actions.new') }]}
                    />
                    <FormCapabilityGateState state={createGateState.state} onRetry={createGateState.retry} />
                </PageContainer>
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
    // GAP-D-07 / SM-05: the shared pending-change panel (vendors namespace).
    const pendingChangePanel = vendor.pending_change ? (
        <PendingChangePanel
            pendingChange={vendor.pending_change}
            namespace="vendors"
            testIdPrefix="vendor"
            cancelling={isCancellingPendingChange}
            onCancel={resolveCapabilityFlag(vendor.pending_change.capabilities, 'can_cancel')
                ? openPendingChangeCancellation
                : undefined}
        />
    ) : null;
    const resolveOwnershipInGovernance = () => void navigate('/governance?type=vendor');

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
                <>
                    <EditBlockedState
                        notice={staleWarning}
                        entityName={vendor.name}
                        documentTitle={tCommon('page_title.edit', { name: vendor.name })}
                        back={editBack}
                        breadcrumbs={editBreadcrumbs}
                        testId="vendor-edit-blocked"
                    >
                        {pendingChangePanel}
                    </EditBlockedState>
                    {pendingCancellationDialog}
                </>
            );
        }
        if (vendor.owner_orphaned) {
            return (
                <PageContainer>
                    {staleWarning}
                    <PageHeader
                        title={t('actions.edit')}
                        description={vendor.name}
                        documentTitle={tCommon('page_title.edit', { name: vendor.name })}
                        back={editBack}
                        breadcrumbs={editBreadcrumbs}
                    />
                    <VendorOwnershipPendingMessage
                        canViewGovernance={authz.canViewGovernance}
                        onResolve={resolveOwnershipInGovernance}
                        testId="vendor-orphan-edit-blocked"
                    />
                </PageContainer>
            );
        }
        if (canEdit !== true) {
            return (
                <PageContainer size="form">
                    <PageHeader
                        title={t('actions.edit')}
                        description={vendor.name}
                        documentTitle={tCommon('page_title.edit', { name: vendor.name })}
                        back={editBack}
                        breadcrumbs={editBreadcrumbs}
                    />
                    <FormCapabilityGateState state="denied" />
                </PageContainer>
            );
        }

        return (
            <VendorFormView
                mode="edit"
                vendor={vendor}
                notice={staleWarning}
                back={editBack}
                breadcrumbs={editBreadcrumbs}
                onSaved={(saved) => navigate(vendorDetailPath(saved.id))}
                onApprovalQueued={(queued) => announceApprovalQueued({
                    approvalId: queued.approval_id,
                    to: vendorDetailPath(vendor.id),
                })}
                onCancel={() => navigate(vendorDetailPath(vendor.id))}
            />
        );
    }

    return (
        <PageContainer>
            {staleWarning}
            <ApprovalQueuedNotice />

            {vendor.owner_orphaned ? (
                <VendorOwnershipPendingMessage
                    canViewGovernance={authz.canViewGovernance}
                    onResolve={resolveOwnershipInGovernance}
                    testId="vendor-orphan-banner"
                />
            ) : null}

            {pendingChangePanel}

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
        </PageContainer>
    );
}

export default VendorDetailPage;
