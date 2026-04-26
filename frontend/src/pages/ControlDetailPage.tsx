import { useState, useEffect, useCallback } from 'react';
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
import { riskApi } from '@/services/riskApi';
import type { Control, ControlRiskLink } from '@/types/control';
import { ControlStatus } from '@/types/control';
import type { ControlEffectiveness } from '@/types/risk';
import type { Risk } from '@/types/risk';
import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { apiClient } from '@/services/apiClient';
import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import { DetailActionBanner, type DetailActionMessage } from '@/pages/detail/DetailActionBanner';
import { useArchiveRestoreAction } from '@/pages/detail/useArchiveRestoreAction';
import { useDetailResource } from '@/pages/detail/useDetailResource';
import { logError } from '@/services/logger';

type TabView = 'overview' | 'history';

export function ControlDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation(['common', 'controls', 'errorKeys']);
    const { t: tIssues } = useTranslation('issues');
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [historyKey, setHistoryKey] = useState(0);
    const [activeTab, setActiveTab] = useState<TabView>('overview');
    const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
    const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
    const [isLoadingRisk, setIsLoadingRisk] = useState(false);
    const [linkedRisksErrorKey, setLinkedRisksErrorKey] = useState<string | null>(null);
    const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);
    const [approvalMessage, setApprovalMessage] = useState<DetailActionMessage | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const loadControl = useCallback((controlId: number) => controlApi.getControl(controlId), []);
    const {
        errorKey,
        isLoading,
        refetch: fetchControl,
        resource: control,
        resourceId: controlId,
    } = useDetailResource<Control>({
        rawId: id,
        load: loadControl,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    const { runArchive, runRestore } = useArchiveRestoreAction({
        setMessage: setApprovalMessage,
        toErrorKey: (error) => apiClient.toUiMessageKey(error),
    });

    useEffect(() => {
        const flash = (location.state as { controlFlash?: { message: string; tone: 'warn' } } | null)?.controlFlash;
        if (!flash) {
            return;
        }
        setApprovalMessage({ key: flash.message, isError: false });
        void navigate(location.pathname, { replace: true });
    }, [location.pathname, location.state, navigate]);

    const fetchLinkedRisks = useCallback(async () => {
        if (controlId === null) return;

        try {
            const riskData = await controlApi.getLinkedRisks(controlId);
            setLinkedRisks(riskData);
            setLinkedRisksErrorKey(null);
        } catch (err) {
            logError('Error fetching linked risks:', err);
            setLinkedRisksErrorKey('controls:detail.linked_risks_load_failed');
        }
    }, [controlId]);

    useEffect(() => {
        void fetchLinkedRisks();
    }, [fetchLinkedRisks]);

    const handleArchive = async (reason: string) => {
        if (!control) return;
        await runArchive({
            archive: () => controlApi.deleteControl(control.id, reason),
            approvalKey: 'controls:detail.archive_approval_submitted',
            closeDialog: () => setIsArchiveDialogOpen(false),
            onImmediate: () => navigate('/controls'),
        });
    };

    const handleRestore = async () => {
        if (!control) return;
        await runRestore({
            restore: () => controlApi.restoreControl(control.id),
            successKey: 'controls:detail.control_restored',
            onRestored: async () => {
                await fetchControl();
                await fetchLinkedRisks();
            },
        });
    };

    const handleLinkRisk = async (riskId: number, effectiveness: ControlEffectiveness, notes?: string) => {
        if (!control) return;
        setLinkErrorKey(null);
        try {
            await controlApi.linkRisk(control.id, { risk_id: riskId, effectiveness, notes });
            const riskData = await controlApi.getLinkedRisks(control.id);
            setLinkedRisks(riskData);
        } catch (err) {
            logError('Linking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    };

    const handleUnlinkRisk = async (riskId: number) => {
        if (!control) return;
        setLinkErrorKey(null);
        try {
            await controlApi.unlinkRisk(control.id, riskId);
            const riskData = await controlApi.getLinkedRisks(control.id);
            setLinkedRisks(riskData);
        } catch (err) {
            logError('Unlinking failed:', err);
            setLinkErrorKey(apiClient.toUiMessageKey(err));
        }
    };

    const handleRiskClick = async (riskId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setIsLoadingRisk(true);
        try {
            const risk = await riskApi.getRisk(riskId);
            setSelectedRisk(risk);
            setIsRiskModalOpen(true);
        } catch (err) {
            logError('Failed to fetch risk details:', err);
        } finally {
            setIsLoadingRisk(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('loading.control_data')}</p>
            </div>
        );
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

    const activeLinkedRisks = linkedRisks.filter((link) => link.risk?.status !== 'archived');
    const archivedLinkedRisks = linkedRisks.filter((link) => link.risk?.status === 'archived');
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
            {approvalMessage && (
                <DetailActionBanner
                    approvalsLabel={t('navigation:tabs.approvals')}
                    message={approvalMessage}
                    messageText={actionMessageText(approvalMessage.key)}
                    onClose={() => setApprovalMessage(null)}
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
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${control.status === ControlStatus.ACTIVE ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-slate-500 border-white/10'
                            }`}>
                            {control.status}
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
                        isOpen={isIssueModalOpen}
                        onClose={() => setIsIssueModalOpen(false)}
                        onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                        onOpen={() => setIsIssueModalOpen(true)}
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
                    {control.status === ControlStatus.ARCHIVED ? (
                        canRestoreControl && <button
                            onClick={handleRestore}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all"
                            title={t('controls:actions.unarchive')}
                        >
                            <RotateCcw className="h-5 w-5" />
                        </button>
                    ) : (
                        canArchiveControl && <button
                            onClick={() => setIsArchiveDialogOpen(true)}
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
                    onClick={() => setActiveTab('overview')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'overview'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Target className="h-4 w-4 inline mr-2" />{t('controls:tabs.overview')}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'history'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />{t('controls:detail.execution_history')}
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <ControlDetailOverviewTab
                    control={control}
                    t={t}
                    linkedRisks={linkedRisks}
                    activeLinkedRisks={activeLinkedRisks}
                    archivedLinkedRisks={archivedLinkedRisks}
                    canLinkRisk={canLinkRisk}
                    canUnlinkRisk={canUnlinkRisk}
                    linkErrorKey={linkErrorKey}
                    linkedRisksErrorKey={linkedRisksErrorKey}
                    isLinkDialogOpen={isLinkDialogOpen}
                    selectedRisk={selectedRisk}
                    isRiskModalOpen={isRiskModalOpen}
                    onOpenLinkDialog={() => setIsLinkDialogOpen(true)}
                    onCloseLinkDialog={() => setIsLinkDialogOpen(false)}
                    onLinkRisk={handleLinkRisk}
                    onUnlinkRisk={handleUnlinkRisk}
                    onRiskClick={handleRiskClick}
                    onCloseRiskModal={() => {
                        setIsRiskModalOpen(false);
                        setSelectedRisk(null);
                    }}
                />
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
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
                                onClick={() => setIsLogModalOpen(true)}
                                className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center gap-2 group-hover:shadow-lg group-hover:shadow-accent/30"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('controls:execution.log_execution')}
                            </button>
                        )}
                    </div>

                    <ExecutionHistory key={historyKey} controlId={control.id} />
                </motion.div>
            )}

            <ExecutionLogModal
                isOpen={isLogModalOpen}
                onClose={() => setIsLogModalOpen(false)}
                controlId={control.id}
                controlName={control.name}
                onSuccess={() => {
                    setHistoryKey((prev) => prev + 1);
                    void fetchControl();
                }}
            />

            <ArchiveConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => setIsArchiveDialogOpen(false)}
                onConfirm={handleArchive}
                resourceType="control"
                resourceName={control.name}
            />

            {/* Global Loading Overlay for Risk Fetching */}
            <AnimatePresence>
                {isLoadingRisk && (
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
