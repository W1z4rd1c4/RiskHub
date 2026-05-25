import { useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Edit,
    Trash2,
    History,
    XCircle,
    Plus,
    Target,
    RotateCcw
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import type { Control } from '@/types/control';
import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { apiClient } from '@/services/apiClient';
import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';
import { useControlDetailWorkflow } from '@/pages/controls/useControlDetailWorkflow';
import { getControlDisplayStatus, getControlStatusColor } from '@/pages/controls/controlsPagePresentation';

export function ControlDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation(['common', 'controls', 'errorKeys']);
    const { t: tIssues } = useTranslation('issues');
    const loadControl = useCallback((controlId: number) => controlApi.getControl(controlId), []);
    const {
        errorKey,
        isAccessDenied,
        isLoading,
        refetch: fetchControl,
        resource: control,
        resourceId: controlId,
    } = useDetailQuery<Control>({
        entity: 'control',
        rawId: id,
        load: loadControl,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    const workflow = useControlDetailWorkflow({ control, controlId, fetchControl, navigate });

    useEffect(() => {
        const flash = (location.state as { controlFlash?: { message: string; tone: 'warn' } } | null)?.controlFlash;
        if (!flash) {
            return;
        }
        workflow.setApprovalMessage({ key: flash.message, isError: false });
        void navigate(location.pathname, { replace: true });
    }, [location.pathname, location.state, navigate, workflow]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('loading.control_data')}</p>
            </div>
        );
    }

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    if (errorKey || !control) {
        return (
            <div className="glass-card flex flex-col items-center justify-center p-20 text-center gap-4">
                <div className="bg-rose-500/20 p-4 rounded-full">
                    <XCircle className="h-10 w-10 text-rose-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('access.control_not_found')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">{t('errors.not_found')}</p>
                </div>
                <button
                    onClick={() => navigate('/controls')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> {t('navigation:tabs.controls')}
                </button>
            </div>
        );
    }

    const activeLinkedRisks = workflow.linkedRisks.filter((link) => !link.risk?.is_archived);
    const archivedLinkedRisks = workflow.linkedRisks.filter((link) => link.risk?.is_archived);
    const displayStatus = getControlDisplayStatus(control);
    const monitoring = getControlMonitoringMeta(control.monitoring_status);
    const MonitoringIcon = monitoring.icon;
    const canUpdateControl = resolveCapabilityFlag(control.capabilities, 'can_update');
    const canArchiveControl =
        resolveCapabilityFlag(control.capabilities, 'can_archive_immediately') ||
        resolveCapabilityFlag(control.capabilities, 'can_request_archive_approval');
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

            {/* Header / Breadcrumb */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-2">
                    <button
                        onClick={() => navigate('/controls')}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-4"
                    >
                        <ArrowLeft className="h-3 w-3" /> {t('controls:detail.back_to_catalog')}
                    </button>
                    <div className="flex items-center gap-4">
                        <h2 className="text-4xl font-black text-white tracking-tighter">{control.name}</h2>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10 ${getControlStatusColor(displayStatus)}`}>
                            {t(`controls:status.${displayStatus}`)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${monitoring.badgeClassName}`}>
                            <MonitoringIcon className="h-3 w-3" />
                            {t(monitoring.labelKey)}
                        </span>
                    </div>
                    <p className="text-slate-500 font-medium max-w-2xl">{control.description}</p>
                </div>

                <div className="flex items-center gap-3">
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
                        <button
                            onClick={() => navigate(`/controls/${control.id}/edit`)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/50 transition-all hover:shadow-lg hover:shadow-accent/20"
                            title={t('controls:edit_control')}
                        >
                            <Edit className="h-5 w-5" />
                        </button>
                    )}
                    {control.is_archived ? (
                        canRestoreControl && <button
                            onClick={workflow.handleRestore}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all"
                            title={t('controls:actions.unarchive')}
                        >
                            <RotateCcw className="h-5 w-5" />
                        </button>
                    ) : (
                        canArchiveControl && <button
                            onClick={() => workflow.setIsArchiveDialogOpen(true)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-400/50 transition-all"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10">
                <button
                    onClick={() => workflow.setActiveTab('overview')}
                    className={`px-6 py-3 font-bold transition-all ${workflow.activeTab === 'overview'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Target className="h-4 w-4 inline mr-2" />{t('controls:tabs.overview')}
                </button>
                <button
                    onClick={() => workflow.setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-all ${workflow.activeTab === 'history'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />{t('controls:detail.execution_history')}
                </button>
            </div>

            {/* Overview Tab */}
            {workflow.activeTab === 'overview' && (
                <ControlDetailOverviewTab
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
                />
            )}

            {/* History Tab */}
            {workflow.activeTab === 'history' && (
                <motion.div
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
                                onClick={() => workflow.setIsLogModalOpen(true)}
                                className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center gap-2 group-hover:shadow-lg group-hover:shadow-accent/30"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('controls:execution.log_execution')}
                            </button>
                        )}
                    </div>

                    <ExecutionHistory
                        key={workflow.historyKey}
                        controlId={control.id}
                        controlName={control.name}
                        canCreateIssue={canCreateIssue}
                        createIssueLabel={tIssues('actions.new_issue')}
                        onIssueCreated={(issue) => navigate(`/issues/${issue.id}`)}
                    />
                </motion.div>
            )}

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

            {/* Global Loading Overlay for Risk Fetching */}
            <AnimatePresence>
                {workflow.isLoadingRisk && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]"
                    >
                        <div className="glass-card !p-6 shadow-2xl flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{t('controls:detail.fetching_risk_details')}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default ControlDetailPage;
