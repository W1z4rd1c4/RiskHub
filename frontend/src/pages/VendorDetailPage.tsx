import { useProtectedDetailShell } from './detail/useProtectedDetailShell';
import { governedReasonRequirement } from '@/lib/governedReasonRequirement';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { useAuthz } from '@/authz/useAuthz';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { PageContainer } from '@/components/layout/PageContainer';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { vendorApi } from '@/services/vendorApi';
import { EditBlockedState } from './detail/EditBlockedState';
import { OwnershipGovernanceAlert } from './detail/OwnershipGovernanceAlert';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { VendorOverviewTab } from './vendors/VendorOverviewTab';
import { VendorDetailHeader } from './vendors/VendorDetailHeader';
import { VendorFormView } from './vendors/VendorFormView';
import { useVendorDetailState } from './vendors/useVendorDetailState';
import { appendRegisterReturnTo } from './shared/registerReturnContext';
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
    const announceApprovalQueued = useApprovalQueued();
    useNormalizeLegacyVendorDetailSearch(location, navigate);
    useVendorDeepLinkScroll(location);
    const { returnTo, openArchive, loadState, staleWarning, pendingChangePanel, pendingCancellationDialog, archiveDialog } = useProtectedDetailShell({
        entity: 'vendor', namespace: 'vendors', resource: vendor, resourceId: vendorId,
        targetName: vendor?.name ?? '', loadOutcome, isRetrying, refresh: fetchVendor,
        archive: (id, reason) => vendorApi.archiveVendor(id, reason ?? ''), archiveReason: vendor ? governedReasonRequirement(vendor) : 'unavailable',
        loading: <VendorDetailLoadingState />,
    });
    const vendorDetailPath = (vendorId: number) => appendRegisterReturnTo(`/vendors/${vendorId}`, returnTo);

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => vendorApi.getVendors({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load vendor create capabilities.',
    });

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

    if (loadState || !vendor) return loadState;

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
                onArchive={openArchive}
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

            {archiveDialog}
            {pendingCancellationDialog}
        </PageContainer>
    );
}

export default VendorDetailPage;
