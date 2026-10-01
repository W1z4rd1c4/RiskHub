import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Archive,
    Edit,
    Star,
    History,
    FileText,
    Target,
    RotateCcw
} from 'lucide-react';
import { useRiskTypes } from '@/hooks/useRiskHubConfig';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { canArchive, resolveCapabilityFlag } from '@/lib/capabilities';
import { RiskDetailOverviewTab } from '@/components/risks/RiskDetailOverviewTab';
import { RiskDetailKriHistoryTab } from '@/components/risks/RiskDetailKriHistoryTab';
import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import { useTranslation } from '@/i18n/hooks';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { DetailLoadUnavailableState, DetailStaleWarning } from '@/pages/detail/DetailLoadState';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import { useRiskDetailState } from '@/pages/detail/useRiskDetailState';
import { getRiskDisplayStatus } from '@/pages/risks/risksPagePresentation';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from '@/pages/shared/registerReturnContext';
import { InlineMessage } from '@/components/ui/inline-message';
import { LoadingState } from '@/components/ui/state';

const RISK_TABS_ID_PREFIX = 'risk-detail';

export function RiskDetailPage() {
    const { id } = useParams<{ id: string }>();
    return <RiskDetailRoute key={id ?? 'invalid'} rawId={id} />;
}

function RiskDetailRoute({ rawId }: { rawId: string | undefined }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/risks');
    const { t } = useTranslation('common');
    const { t: tIssues } = useTranslation('issues');
    const { getColor, getDisplayName } = useRiskTypes();
    const {
        activeTab,
        approvalMessage,
        dialogMode,
        handleArchive,
        handleLinkControl,
        handleRestore,
        handleUnlinkControl,
        isCreateDialogOpen,
        isDeleteDialogOpen,
        isDeleting,
        isIssueModalOpen,
        isLinkDialogOpen,
        isRetrying,
        kriHistoryItems,
        kriHistoryOutcome,
        linkErrorKey,
        linkedControls,
        linkedControlsOutcome,
        linkedVendors,
        linkedVendorsOutcome,
        loadOutcome,
        overdueKRIs,
        overdueKrisOutcome,
        refreshData,
        resourceId,
        retryKriHistory,
        retryLinkedControls,
        retryLinkedVendors,
        retryOverdueKris,
        risk,
        setActiveTab,
        setApprovalMessage,
        setDialogMode,
        setIsCreateDialogOpen,
        setIsDeleteDialogOpen,
        setIsIssueModalOpen,
        setIsLinkDialogOpen,
        setLinkErrorKey,
    } = useRiskDetailState({ rawId, returnTo });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-success-text border-success/20 bg-success/10';
            case 'emerging': return 'text-warning-text border-warning/20 bg-warning/10';
            default: return 'text-muted-foreground border-border bg-muted';
        }
    };


    if (loadOutcome === 'loading') {
        return (
            <div data-loading="true">
                <LoadingState layout="page" label={t('loading.risk_data')} />
            </div>
        );
    }

    if (loadOutcome === 'unavailable' || !risk) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('risks:actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={resourceId === null ? undefined : () => void refreshData()}
            />
        );
    }

    const canUpdateRisk = resolveCapabilityFlag(risk.capabilities, 'can_update');
    const canArchiveRisk = canArchive(risk.capabilities);
    const canRestoreRisk = resolveCapabilityFlag(risk.capabilities, 'can_restore');
    const canCreateIssue = resolveCapabilityFlag(risk.capabilities, 'can_create_issue');
    const displayStatus = getRiskDisplayStatus(risk);

    return (
        <PageContainer>
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void refreshData()} />
            ) : null}
            <ApprovalQueuedNotice />
            {/* Approval/Error Message Banner */}
            {approvalMessage && (
                <DetailActionBanner
                    approvalsLabel={t('navigation:tabs.approvals')}
                    message={approvalMessage}
                    messageText={approvalMessage.isError ? t(approvalMessage.key, { ns: 'errorKeys' }) : t(approvalMessage.key)}
                    onClose={() => setApprovalMessage(null)}
                    onNavigateApprovals={() => navigate('/approvals')}
                    pendingText={t('risks:messages.view_pending_approvals_prefix')}
                    sectionSuffix={t('risks:messages.view_pending_approvals_suffix')}
                />
            )}

            {/* Link Error Message */}
            {linkErrorKey && (
                <InlineMessage
                    tone="danger"
                    onDismiss={() => setLinkErrorKey(null)}
                    dismissLabel={t('actions.close')}
                >
                    {t(linkErrorKey, { ns: 'errorKeys' })}
                </InlineMessage>
            )}

            <EntityDetailHeader
                back={{ label: t('risks:actions.back_to_register'), onClick: () => void navigate(returnTo) }}
                breadcrumbs={[{ label: t('navigation:sidebar.risks'), to: returnTo }, { label: risk.name }]}
                identifier={risk.risk_id_code}
                identifierSeparatorLabel={t('detail_header.identifier_separator')}
                title={risk.name}
                titleAdornment={risk.is_priority ? <Star className="h-5 w-5 text-warning-text fill-warning" /> : undefined}
                statuses={(
                    <>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${getStatusColor(displayStatus)}`}>
                            {displayStatus}
                        </span>
                    </>
                )}
                metadata={<span>{risk.process}</span>}
                description={risk.description}
                actions={(
                    <>
                    {canUpdateRisk && (
                        <Button
                            type="button"
                            variant="accent"
                            onClick={() => navigate(appendRegisterReturnTo(`/risks/${risk.id}/edit`, returnTo))}
                        >
                            <Edit aria-hidden="true" />
                            {t('risks:edit_risk')}
                        </Button>
                    )}
                    <ContextualIssueAction
                        buttonLabel={tIssues('actions.new_issue')}
                        canCreateIssue={canCreateIssue}
                        contextEntityId={risk.id}
                        contextEntityLabel={risk.name}
                        contextEntityType="risk"
                        isOpen={isIssueModalOpen}
                        onClose={() => setIsIssueModalOpen(false)}
                        onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        onOpen={() => setIsIssueModalOpen(true)}
                    />
                    {risk.is_archived ? (
                        canRestoreRisk && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleRestore}
                            >
                                <RotateCcw aria-hidden="true" />
                                {t('risks:tooltips.unarchive_risk')}
                            </Button>
                        )
                    ) : (
                        canArchiveRisk && (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => {
                                    setApprovalMessage(null);
                                    setIsDeleteDialogOpen(true);
                                }}
                            >
                                <Archive aria-hidden="true" />
                                {t('actions.archive')}
                            </Button>
                        )
                    )}
                    </>
                )}
            />

            <TabList
                tabs={[
                    { id: 'overview', label: t('risks:tabs.overview'), icon: Target },
                    { id: 'history', label: t('risks:tabs.history'), icon: History },
                    { id: 'assessment', label: t('risks:tabs.assessment'), icon: FileText },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={RISK_TABS_ID_PREFIX}
                ariaLabel={risk.name}
            />

            {/* Overview Tab */}
            <TabPanel tab="overview" activeTab={activeTab} idPrefix={RISK_TABS_ID_PREFIX}>
                {activeTab === 'overview' && <RiskDetailOverviewTab
                    risk={risk}
                    linkedControls={linkedControls}
                    linkedVendors={linkedVendors}
                    overdueKRIs={overdueKRIs}
                    linkedControlsOutcome={linkedControlsOutcome}
                    linkedVendorsOutcome={linkedVendorsOutcome}
                    overdueKrisOutcome={overdueKrisOutcome}
                    onRetryLinkedControls={() => void retryLinkedControls()}
                    onRetryLinkedVendors={() => void retryLinkedVendors()}
                    onRetryOverdueKris={() => void retryOverdueKris()}
                    getColor={getColor}
                    getDisplayName={getDisplayName}
                    onNavigateToNewKri={() => navigate(`/kris/new?risk_id=${risk.id}`)}
                    onNavigateToKri={(kriId) => navigate(`/kris/${kriId}`)}
                    onLinkControl={handleLinkControl}
                    onUnlinkControl={handleUnlinkControl}
                    onOpenCreateControl={() => setIsCreateDialogOpen(true)}
                    onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
                    onNavigateToVendor={(vendorId) => navigate(`/vendors/${vendorId}`)}
                    onRefreshData={refreshData}
                    isLinkDialogOpen={isLinkDialogOpen}
                    setIsLinkDialogOpen={setIsLinkDialogOpen}
                    dialogMode={dialogMode}
                    setDialogMode={setDialogMode}
                    isCreateDialogOpen={isCreateDialogOpen}
                    setIsCreateDialogOpen={setIsCreateDialogOpen}
                />}
            </TabPanel>

            {/* History Tab */}
            <TabPanel tab="history" activeTab={activeTab} idPrefix={RISK_TABS_ID_PREFIX}>
                {activeTab === 'history' && <RiskDetailKriHistoryTab
                    items={kriHistoryItems}
                    hasKRIs={!!(risk.kris && risk.kris.length > 0)}
                    outcome={kriHistoryOutcome}
                    onRetry={() => void retryKriHistory()}
                />}
            </TabPanel>

            {/* Risk Assessment Tab */}
            <TabPanel tab="assessment" activeTab={activeTab} idPrefix={RISK_TABS_ID_PREFIX}>
                {activeTab === 'assessment' && <RiskDetailQuestionnairesTab risk={risk} />}
            </TabPanel>

            {/* Archive confirmation (D10, PM-1): the risk API always takes a
                reason and routes non-approvers through approval, so the
                reason is required. */}
            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={handleArchive}
                intent="archive"
                entityLabel={t('common:labels.risk')}
                entityName={risk.name}
                reason="required"
                reasonPlaceholder={t('common:labels.archive_reason_placeholder')}
                isLoading={isDeleting}
                errorText={approvalMessage?.isError
                    ? t(approvalMessage.key, { ns: 'errorKeys' })
                    : null}
            />

        </PageContainer>
    );
}

export default RiskDetailPage;
