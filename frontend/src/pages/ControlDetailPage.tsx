import { useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowLeft,
    Edit,
    Trash2,
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
import { Button } from '@/components/ui/button';
import { ControlRiskLoadingOverlay } from '@/components/controls/ControlRiskLoadingOverlay';
import { useTranslation } from '@/i18n/hooks';
import { canArchive, resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { DetailLoadUnavailableState, DetailStaleWarning } from '@/pages/detail/DetailLoadState';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { controlDetailTabs, useControlDetailWorkflow } from '@/pages/controls/useControlDetailWorkflow';
import { getControlDisplayStatus, getControlStatusColor } from '@/pages/controls/controlsPagePresentation';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from '@/pages/shared/registerReturnContext';
import { useContentTabs } from '@/hooks/useContentTabs';

export function ControlDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/controls');
    const { t } = useTranslation(['common', 'controls', 'errorKeys']);
    const { t: tIssues } = useTranslation('issues');
    const loadControl = useCallback((controlId: number) => controlApi.getControl(controlId), []);
    const {
        isRetrying,
        loadOutcome,
        refetch: fetchControl,
        resource: control,
        resourceId: controlId,
    } = useDetailQuery<Control>({
        entity: 'control',
        rawId: id,
        load: loadControl,
    });

    const workflow = useControlDetailWorkflow({ control, controlId, fetchControl, navigate, returnTo });
    const { setApprovalMessage } = workflow;
    const { getPanelProps, getTabProps } = useContentTabs({
        tabs: controlDetailTabs,
        activeTab: workflow.activeTab,
        onChange: workflow.setActiveTab,
        idPrefix: 'control-detail',
    });

    useEffect(() => {
        const flash = (location.state as { controlFlash?: { message: string; tone: 'warn' } } | null)?.controlFlash;
        if (!flash) {
            return;
        }
        setApprovalMessage({ key: flash.message, isError: false });
        void navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true });
    }, [location.hash, location.pathname, location.search, location.state, navigate, setApprovalMessage]);

    if (loadOutcome === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('loading.control_data')}</p>
            </div>
        );
    }

    if (loadOutcome === 'unavailable' || !control) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('navigation:tabs.controls')}
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
    const actionMessageText = (key: string) => (
        key.startsWith('errorKeys.')
            ? t(key, { ns: 'errorKeys' })
            : key.includes(':')
                ? t(key)
                : key
    );

    return (
        <div className="space-y-8">
            {loadOutcome === 'stale-with-error' ? (
                <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchControl()} />
            ) : null}
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
                backAction={(
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => navigate(returnTo)}
                        className="text-xs font-black uppercase tracking-widest"
                    >
                        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> {t('controls:detail.back_to_catalog')}
                    </Button>
                )}
                identifierSeparatorLabel={t('detail_header.identifier_separator')}
                title={control.name}
                statuses={(
                    <>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-white/10 ${getControlStatusColor(displayStatus)}`}>
                            {t(`controls:status.${displayStatus}`)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${monitoring.badgeClassName}`}>
                            <MonitoringIcon className="h-3 w-3" />
                            {t(monitoring.labelKey)}
                        </span>
                    </>
                )}
                description={control.description}
                actions={(
                    <>
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
                    {/* Edit button: show for controls:write OR control owner */}
                    {canUpdateControl && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => navigate(appendRegisterReturnTo(`/controls/${control.id}/edit`, returnTo))}
                            title={t('controls:edit_control')}
                            aria-label={t('controls:edit_control')}
                        >
                            <Edit className="h-5 w-5" aria-hidden="true" />
                        </Button>
                    )}
                    {control.is_archived ? (
                        canRestoreControl && <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={workflow.handleRestore}
                            title={t('controls:actions.unarchive')}
                            aria-label={t('controls:actions.unarchive')}
                        >
                            <RotateCcw className="h-5 w-5" aria-hidden="true" />
                        </Button>
                    ) : (
                        canArchiveControl && <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => workflow.setIsArchiveDialogOpen(true)}
                            title={t('actions.archive')}
                            aria-label={t('actions.archive')}
                        >
                            <Trash2 className="h-5 w-5" aria-hidden="true" />
                        </Button>
                    )}
                    </>
                )}
            />

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10" role="tablist" aria-label={control.name}>
                <button
                    {...getTabProps('overview', 0)}
                    className={`px-6 py-3 font-bold transition-colors ${workflow.activeTab === 'overview'
                        ? 'text-accent-text border-b-2 border-accent'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <Target className="h-4 w-4 inline mr-2" />{t('controls:tabs.overview')}
                </button>
                <button
                    {...getTabProps('history', 1)}
                    className={`px-6 py-3 font-bold transition-colors ${workflow.activeTab === 'history'
                        ? 'text-accent-text border-b-2 border-accent'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />{t('controls:detail.execution_history')}
                </button>
            </div>

            {/* Overview Tab */}
            <div {...getPanelProps('overview')}>
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
                    isLinkDialogOpen={workflow.isLinkDialogOpen}
                    selectedRisk={workflow.selectedRisk}
                    isRiskModalOpen={workflow.isRiskModalOpen}
                    onOpenLinkDialog={() => workflow.setIsLinkDialogOpen(true)}
                    onCloseLinkDialog={() => workflow.setIsLinkDialogOpen(false)}
                    onLinkRisk={workflow.handleLinkRisk}
                    onUnlinkRisk={workflow.handleUnlinkRisk}
                    onRiskClick={workflow.handleRiskClick}
                    onCloseRiskModal={workflow.closeRiskModal}
                />}
            </div>

            {/* History Tab */}
            <div {...getPanelProps('history')}>
                {workflow.activeTab === 'history' && <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card"
                >
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center gap-2">
                            <History className="h-4 w-4 text-accent" />
                            {t('controls:detail.execution_audit_trail')}
                        </h3>
                        {canLogExecution && (
                            <button
                                data-testid="control-log-execution"
                                onClick={() => workflow.setIsLogModalOpen(true)}
                                className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl text-accent-text text-xs font-black uppercase tracking-widest hover:bg-accent hover:text-accent-foreground transition-[background-color,color,box-shadow] flex items-center gap-2 group-hover:shadow-lg group-hover:shadow-accent/30"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('controls:execution.log_execution')}
                            </button>
                        )}
                    </div>

                    <ExecutionHistory
                        controlId={control.id}
                        controlName={control.name}
                        canCreateIssue={canCreateIssue}
                        createIssueLabel={tIssues('actions.new_issue')}
                        onIssueCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        refreshKey={workflow.historyKey}
                    />
                </motion.div>}
            </div>

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
        </div>
    );
}

export default ControlDetailPage;
