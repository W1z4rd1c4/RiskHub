import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Edit,
    Trash2,
    FileText,
    History,
    XCircle,
    Plus,
    Target,
    AlertCircle,
    RotateCcw
} from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import type { Control, ControlRiskLink } from '@/types/control';
import { ControlStatus } from '@/types/control';
import { PermissionGate } from '@/components/PermissionGate';
import type { ControlEffectiveness } from '@/types/risk';
import type { Risk } from '@/types/risk';
import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { getControlMonitoringMeta } from '@/lib/monitoringStatus';
import { isApprovalCreatedResponse } from '@/types/approval';
import { apiClient } from '@/services/apiClient';
import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';

type TabView = 'overview' | 'history';

export function ControlDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation(['common', 'controls', 'errorKeys']);
    const { t: tIssues } = useTranslation('issues');
    const { user, hasPermission } = useAuth();
    const [control, setControl] = useState<Control | null>(null);
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
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
    const [approvalMessage, setApprovalMessage] = useState<{ key: string; isError?: boolean } | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const fetchControl = useCallback(async () => {
        if (!id) return;
        const ctrlId = parseInt(id);

        try {
            setIsLoading(true);
            const ctrlData = await controlApi.getControl(ctrlId);
            setControl(ctrlData);
            setErrorKey(null);
        } catch (err) {
            console.error('Error fetching control details:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
            setIsLoading(false);
            return;
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    const fetchLinkedRisks = useCallback(async () => {
        if (!id) return;
        const ctrlId = parseInt(id);

        try {
            const riskData = await controlApi.getLinkedRisks(ctrlId);
            setLinkedRisks(riskData);
            setLinkedRisksErrorKey(null);
        } catch (err) {
            console.error('Error fetching linked risks:', err);
            setLinkedRisksErrorKey('controls:detail.linked_risks_load_failed');
        }
    }, [id]);

    useEffect(() => {
        void fetchControl();
        void fetchLinkedRisks();
    }, [fetchControl, fetchLinkedRisks]);

    const handleArchive = async (reason: string) => {
        if (!control) return;
        try {
            const response = await controlApi.deleteControl(control.id, reason);

            // Check if the response indicates approval was required (202)
            if (isApprovalCreatedResponse(response)) {
                setApprovalMessage({
                    key: 'controls:detail.archive_approval_submitted',
                    isError: false,
                });
                setIsArchiveDialogOpen(false);
                // Don't navigate away - show the approval message
                return;
            }

            // Immediate archive (204) - navigate away
            void navigate('/controls');
        } catch (err) {
            console.error('Archive failed:', err);
            setApprovalMessage({ key: apiClient.toUiMessageKey(err), isError: true });
        }
    };

    const handleRestore = async () => {
        if (!control) return;
        try {
            await controlApi.restoreControl(control.id);
            await fetchControl();
            await fetchLinkedRisks();
            setApprovalMessage({ key: 'controls:detail.control_restored', isError: false });
        } catch (err) {
            console.error('Restore failed:', err);
            setApprovalMessage({ key: apiClient.toUiMessageKey(err), isError: true });
        }
    };

    const handleLinkRisk = async (riskId: number, effectiveness: ControlEffectiveness, notes?: string) => {
        if (!control) return;
        setLinkErrorKey(null);
        try {
            await controlApi.linkRisk(control.id, { risk_id: riskId, effectiveness, notes });
            const riskData = await controlApi.getLinkedRisks(control.id);
            setLinkedRisks(riskData);
        } catch (err) {
            console.error('Linking failed:', err);
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
            console.error('Unlinking failed:', err);
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
            console.error('Failed to fetch risk details:', err);
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

    return (
        <div className="space-y-8">
            {/* Approval/Error Message Banner */}
            {approvalMessage && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${approvalMessage.isError
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium">
                            {approvalMessage.key.startsWith('errorKeys.')
                                ? t(approvalMessage.key, { ns: 'errorKeys' })
                                : t(approvalMessage.key)}
                        </p>
                        {!approvalMessage.isError && (
                            <p className="text-xs mt-1 opacity-75">
                                {t('controls:detail.view_pending_approvals')}{' '}
                                <button onClick={() => navigate('/approvals')} className="underline hover:no-underline">{t('navigation:tabs.approvals')}</button>
                                {` ${t('controls:detail.section_suffix')}`}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => setApprovalMessage(null)}
                        className="ml-auto text-current opacity-50 hover:opacity-100"
                    >
                        <XCircle className="h-4 w-4" />
                    </button>
                </div>
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
                    <PermissionGate resource="issues" action="write">
                        <button
                            onClick={() => setIsIssueModalOpen(true)}
                            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-accent/50 transition-all flex items-center gap-2"
                        >
                            <FileText className="h-4 w-4" />
                            {tIssues('actions.new_issue')}
                        </button>
                    </PermissionGate>
                    {/* Edit button: show for controls:write OR control owner */}
                    {(hasPermission('controls', 'write') || control.control_owner_id === user?.id) && (
                        <button
                            onClick={() => navigate(`/controls/${control.id}/edit`)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/50 transition-all hover:shadow-lg hover:shadow-accent/20"
                            title={control.control_owner_id === user?.id && !hasPermission('controls', 'write') ? t('controls:detail.edit_requires_approval') : t('controls:edit_control')}
                        >
                            <Edit className="h-5 w-5" />
                        </button>
                    )}
                    <PermissionGate resource="controls" action="delete">
                        {control.status === ControlStatus.ARCHIVED ? (
                            <button
                                onClick={handleRestore}
                                className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all"
                                title={t('controls:actions.unarchive')}
                            >
                                <RotateCcw className="h-5 w-5" />
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsArchiveDialogOpen(true)}
                                className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-400/50 transition-all"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                        )}
                    </PermissionGate>
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
                        <PermissionGate resource="controls" action="execute">
                            <button
                                onClick={() => setIsLogModalOpen(true)}
                                className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center gap-2 group-hover:shadow-lg group-hover:shadow-accent/30"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('controls:execution.log_execution')}
                            </button>
                        </PermissionGate>
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

            <IssueQuickCreateModal
                isOpen={isIssueModalOpen}
                onClose={() => setIsIssueModalOpen(false)}
                contextEntityType="control"
                contextEntityId={control.id}
                contextEntityLabel={control.name}
                onCreated={(issue) => navigate(`/issues/${issue.id}`)}
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
