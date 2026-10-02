import { useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Archive,
    Edit,
    History,
    Plus,
    Target,
    RotateCcw
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import type { Control } from '@/types/control';
import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { ControlRiskLoadingOverlay } from '@/components/controls/ControlRiskLoadingOverlay';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { canArchive, resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { DetailLoadUnavailableState, DetailStaleWarning } from '@/pages/detail/DetailLoadState';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { useControlDetailWorkflow } from '@/pages/controls/useControlDetailWorkflow';
import { CONTROL_STATUS_LABEL_KEYS, getControlDisplayStatus, getControlStatusColor } from '@/pages/controls/controlsPagePresentation';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from '@/pages/shared/registerReturnContext';
import { LoadingState } from '@/components/ui/state';

const CONTROL_TABS_ID_PREFIX = 'control-detail';

export function ControlDetailPage() {
    const { id } = useParams<{ id: string }>();
    return <ControlDetailRoute key={id ?? 'invalid'} rawId={id} />;
}

function ControlDetailRoute({ rawId }: { rawId: string | undefined }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/controls');
    const { t } = useTranslation(['common', 'controls', 'errorKeys']);
    const { t: tIssues } = useTranslation('issues');
    const loadControl = useCallback(
        (controlId: number, signal?: AbortSignal) => controlApi.getControl(controlId, { signal }),
        [],
    );
    const {
        isRetrying,
        loadOutcome,
        refetch: fetchControl,
        resource: control,
        resourceId: controlId,
    } = useDetailQuery<Control>({
        entity: 'control',
        rawId,
        load: loadControl,
    });

    const workflow = useControlDetailWorkflow({ control, controlId, fetchControl, navigate, returnTo });

    if (loadOutcome === 'loading') {
        return (
            <LoadingState layout="page" label={t('loading.control_data')} />
        );
    }

    if (loadOutcome === 'unavailable' || !control) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('controls:detail.back_to_catalog')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={controlId === null ? undefined : () => void fetchControl()}
            />
        );
    }

    const activeLinkedRisks = workflow.linkedRisks.filter((link) => !link.risk?.is_archived);
    const archivedLinkedRisks = workflow.linkedRisks.filter((link) => link.risk?.is_archived);
    const displayStatus = getControlDisplayStatus(control);
    const monitoring = getControlMonitoringMeta(control.monitoring_status);
    const MonitoringIcon = monitoring.icon;
    const canUpdateControl = resolveCapabilityFlag(control.capabilities, 'can_update');
    const canArchiveControl = canArchive(control.capabilities);
    const canRestoreControl = resolveCapabilityFlag(control.capabilities, 'can_restore');
    const canLogExecution = resolveCapabilityFlag(control.capabilities, 'can_log_execution');
    const canLinkRisk = resolveCapabilityFlag(control.capabilities, 'can_link_risk');
    const canUnlinkRisk = resolveCapabilityFlag(control.capabilities, 'can_unlink_risk');
    const canCreateIssue = resolveCapabilityFlag(control.capabilities, 'can_create_issue');
    const actionMessageText = (key: string) => translateUiMessage(t, key);

    return (
        <PageContainer>
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchControl()} />
            ) : null}
            <ApprovalQueuedNotice />
            {/* Approval/Error Message Banner */}
            {workflow.approvalMessage && (
                <DetailActionBanner
                    approvalsLabel={t('navigation:tabs.approvals')}
                    message={workflow.approvalMessage}
                    messageText={actionMessageText(workflow.approvalMessage.key)}
                    onClose={() => workflow.setApprovalMessage(null)}
                    onNavigateApprovals={() => navigate('/approvals')}
                    pendingText={t('controls:detail.view_pending_approvals')}
                    sectionSuffix={t('controls:detail.section_suffix')}
                />
            )}

            <EntityDetailHeader
                back={{ label: t('controls:detail.back_to_catalog'), onClick: () => void navigate(returnTo) }}
                breadcrumbs={[{ label: t('navigation:sidebar.controls'), to: returnTo }, { label: control.name }]}
                identifierSeparatorLabel={t('detail_header.identifier_separator')}
                title={control.name}
                statuses={(
                    <>
                        <Badge className={getControlStatusColor(displayStatus)} data-status={displayStatus}>
                            {t(CONTROL_STATUS_LABEL_KEYS[displayStatus])}
                        </Badge>
                        <Badge icon={MonitoringIcon} className={monitoring.badgeClassName}>
                            {t(monitoring.labelKey)}
                        </Badge>
                    </>
                )}
                description={control.description}
                actions={(
                    <>
                    {/* Edit button: show for controls:write OR control owner */}
                    {canUpdateControl && (
                        <Button
                            type="button"
                            variant="accent"
                            onClick={() => navigate(appendRegisterReturnTo(`/controls/${control.id}/edit`, returnTo))}
                        >
                            <Edit aria-hidden="true" />
                            {t('controls:edit_control')}
                        </Button>
                    )}
                    <ContextualIssueAction
                        buttonLabel={tIssues('actions.new_issue')}
                        canCreateIssue={canCreateIssue}
                        contextEntityId={control.id}
                        contextEntityLabel={control.name}
                        contextEntityType="control"
                        isOpen={workflow.isIssueModalOpen}
                        onClose={() => workflow.setIsIssueModalOpen(false)}
                        onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        onOpen={() => workflow.setIsIssueModalOpen(true)}
                    />
                    {control.is_archived ? (
                        canRestoreControl && <Button
                            type="button"
                            variant="outline"
                            onClick={workflow.handleRestore}
                        >
                            <RotateCcw aria-hidden="true" />
                            {t('controls:actions.unarchive')}
                        </Button>
                    ) : (
                        canArchiveControl && <Button
                            type="button"
                            variant="destructive"
                            onClick={() => workflow.setIsArchiveDialogOpen(true)}
                        >
                            <Archive aria-hidden="true" />
                            {t('actions.archive')}
                        </Button>
                    )}
                    </>
                )}
            />

            <TabList
                tabs={[
                    { id: 'overview', label: t('controls:tabs.overview'), icon: Target },
                    { id: 'history', label: t('controls:detail.execution_history'), icon: History },
                ]}
                activeTab={workflow.activeTab}
                onChange={workflow.setActiveTab}
                idPrefix={CONTROL_TABS_ID_PREFIX}
                ariaLabel={control.name}
            />

            {/* Overview Tab */}
            <TabPanel tab="overview" activeTab={workflow.activeTab} idPrefix={CONTROL_TABS_ID_PREFIX}>
                {workflow.activeTab === 'overview' && <ControlDetailOverviewTab
                    control={control}
                    t={t}
                    linkedRisks={workflow.linkedRisks}
                    activeLinkedRisks={activeLinkedRisks}
                    archivedLinkedRisks={archivedLinkedRisks}
                    canLinkRisk={canLinkRisk}
                    canUnlinkRisk={canUnlinkRisk}
                    linkErrorKey={workflow.linkErrorKey}
                    linkedRisksErrorKey={workflow.linkedRisksErrorKey}
                    linkedRisksOutcome={workflow.linkedRisksOutcome}
                    isLinkDialogOpen={workflow.isLinkDialogOpen}
                    selectedRisk={workflow.selectedRisk}
                    isRiskModalOpen={workflow.isRiskModalOpen}
                    onOpenLinkDialog={() => workflow.setIsLinkDialogOpen(true)}
                    onCloseLinkDialog={() => workflow.setIsLinkDialogOpen(false)}
                    onLinkRisk={workflow.handleLinkRisk}
                    onUnlinkRisk={workflow.handleUnlinkRisk}
                    onRiskClick={workflow.handleRiskClick}
                    onCloseRiskModal={workflow.closeRiskModal}
                    onRetryLinkedRisks={() => void workflow.retryLinkedRisks()}
                />}
            </TabPanel>

            {/* History Tab */}
            <TabPanel tab="history" activeTab={workflow.activeTab} idPrefix={CONTROL_TABS_ID_PREFIX}>
                {workflow.activeTab === 'history' && <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card"
                >
                    <CardHeader
                        icon={History}
                        title={t('controls:detail.execution_audit_trail')}
                        className="mb-8 border-b border-border pb-4"
                        actions={canLogExecution ? (
                            <Button
                                variant="accent"
                                data-testid="control-log-execution"
                                onClick={() => workflow.setIsLogModalOpen(true)}
                            >
                                <Plus aria-hidden="true" />
                                {t('controls:execution.log_execution')}
                            </Button>
                        ) : undefined}
                    />

                    <ExecutionHistory
                        controlId={control.id}
                        controlName={control.name}
                        canCreateIssue={canCreateIssue}
                        createIssueLabel={tIssues('actions.new_issue')}
                        onIssueCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        refreshKey={workflow.historyKey}
                    />
                </motion.div>}
            </TabPanel>

            <ExecutionLogModal
                isOpen={workflow.isLogModalOpen}
                onClose={() => workflow.setIsLogModalOpen(false)}
                controlId={control.id}
                controlName={control.name}
                onSuccess={workflow.handleExecutionLogged}
            />

            <ArchiveConfirmDialog
                isOpen={workflow.isArchiveDialogOpen}
                onClose={() => workflow.setIsArchiveDialogOpen(false)}
                onConfirm={workflow.handleArchive}
                resourceType="control"
                resourceName={control.name}
            />

            <ControlRiskLoadingOverlay isVisible={workflow.isLoadingRisk} />
        </PageContainer>
    );
}

export default ControlDetailPage;
