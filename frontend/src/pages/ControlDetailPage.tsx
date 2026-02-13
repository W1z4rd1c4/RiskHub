import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Edit,
    Trash2,
    FileText,
    Calendar,
    User,
    Building2,
    BookOpen,
    BarChart3,
    History,
    XCircle,
    ShieldAlert,
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
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ControlEffectiveness } from '@/types/risk';
import type { Risk } from '@/types/risk';
import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { RiskQuickViewModal } from '@/components/RiskQuickViewModal';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { isApprovalCreatedResponse } from '@/types/approval';

type TabView = 'overview' | 'history';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export function ControlDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    const { t: tIssues } = useTranslation('issues');
    const { user, hasPermission } = useAuth();
    const [control, setControl] = useState<Control | null>(null);
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [historyKey, setHistoryKey] = useState(0);
    const [activeTab, setActiveTab] = useState<TabView>('overview');
    const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
    const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
    const [isLoadingRisk, setIsLoadingRisk] = useState(false);
    const [linkedRisksError, setLinkedRisksError] = useState<string | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);
    const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        const ctrlId = parseInt(id);

        // Fetch control data first (critical)
        try {
            setIsLoading(true);
            const ctrlData = await controlApi.getControl(ctrlId);
            setControl(ctrlData);
            setError(null);
        } catch (err) {
            console.error('Error fetching control details:', err);
            setError('Failed to load control details.');
            setIsLoading(false);
            return;
        } finally {
            setIsLoading(false);
        }

        // Fetch linked risks separately (non-critical - page should still render)
        try {
            const riskData = await controlApi.getLinkedRisks(ctrlId);
            setLinkedRisks(riskData);
            setLinkedRisksError(null);
        } catch (err) {
            console.error('Error fetching linked risks:', err);
            setLinkedRisksError('Unable to load linked risks. You may not have access to this data.');
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleArchive = async (reason: string) => {
        if (!control) return;
        try {
            const response = await controlApi.deleteControl(control.id, reason);

            // Check if the response indicates approval was required (202)
            if (isApprovalCreatedResponse(response)) {
                setApprovalMessage(
                    `Archive request submitted for approval (ID: ${response.approval_id}). The control has not been archived yet.`
                );
                setIsArchiveDialogOpen(false);
                // Don't navigate away - show the approval message
                return;
            }

            // Immediate archive (204) - navigate away
            navigate('/controls');
        } catch (err) {
            console.error('Archive failed:', err);
            setApprovalMessage('Failed to archive control. Please try again.');
        }
    };

    const handleRestore = async () => {
        if (!control) return;
        try {
            await controlApi.restoreControl(control.id);
            await fetchData();
            setApprovalMessage('Control restored successfully.');
        } catch (err) {
            console.error('Restore failed:', err);
            setApprovalMessage('Failed to restore control. Please try again.');
        }
    };

    const handleLinkRisk = async (riskId: number, effectiveness: ControlEffectiveness, notes?: string) => {
        if (!control) return;
        setLinkError(null);
        try {
            await controlApi.linkRisk(control.id, { risk_id: riskId, effectiveness, notes });
            const riskData = await controlApi.getLinkedRisks(control.id);
            setLinkedRisks(riskData);
        } catch (err) {
            console.error('Linking failed:', err);
            setLinkError('Failed to link risk. Please try again.');
        }
    };

    const handleUnlinkRisk = async (riskId: number) => {
        if (!control) return;
        setLinkError(null);
        try {
            await controlApi.unlinkRisk(control.id, riskId);
            const riskData = await controlApi.getLinkedRisks(control.id);
            setLinkedRisks(riskData);
        } catch (err) {
            console.error('Unlinking failed:', err);
            setLinkError('Failed to unlink risk. Please try again.');
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

    if (error || !control) {
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
                    <ArrowLeft className="h-4 w-4" /> {t('navigation:tabs.controls', 'Control Catalog')}
                </button>
            </div>
        );
    }

    const getRiskLevelColor = (level: number) => {
        if (level >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-[0_0_15px_rgba(251,113,133,0.1)]';
        if (level >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
        if (level >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    };

    const activeLinkedRisks = linkedRisks.filter((link) => link.risk?.status !== 'archived');
    const archivedLinkedRisks = linkedRisks.filter((link) => link.risk?.status === 'archived');

    return (
        <div className="space-y-8">
            {/* Approval/Error Message Banner */}
            {approvalMessage && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${approvalMessage.includes('Failed')
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium">{approvalMessage}</p>
                        {!approvalMessage.includes('Failed') && (
                            <p className="text-xs mt-1 opacity-75">
                                View pending approvals in the <button onClick={() => navigate('/approvals')} className="underline hover:no-underline">Approvals</button> section.
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
                        <ArrowLeft className="h-3 w-3" /> Back to Catalog
                    </button>
                    <div className="flex items-center gap-4">
                        <h2 className="text-4xl font-black text-white tracking-tighter">{control.name}</h2>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${control.status === ControlStatus.ACTIVE ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-slate-500 border-white/10'
                            }`}>
                            {control.status}
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
                            {tIssues('actions.new_issue', 'New Issue')}
                        </button>
                    </PermissionGate>
                    {/* Edit button: show for controls:write OR control owner */}
                    {(hasPermission('controls', 'write') || control.control_owner_id === user?.id) && (
                        <button
                            onClick={() => navigate(`/controls/${control.id}/edit`)}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-accent/50 transition-all hover:shadow-[0_0_20px_rgba(30,132,255,0.1)]"
                            title={control.control_owner_id === user?.id && !hasPermission('controls', 'write') ? 'Edit as Control Owner (requires approval)' : 'Edit Control'}
                        >
                            <Edit className="h-5 w-5" />
                        </button>
                    )}
                    <PermissionGate resource="controls" action="delete">
                        {control.status === ControlStatus.ARCHIVED ? (
                            <button
                                onClick={handleRestore}
                                className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-emerald-400 hover:border-emerald-400/50 transition-all"
                                title="Unarchive control"
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
                    <Target className="h-4 w-4 inline mr-2" />Overview
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'history'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <History className="h-4 w-4 inline mr-2" />Execution History
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <>
                    <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    >
                        {/* Core Info */}
                        <motion.div variants={item} className="glass-card flex flex-col gap-6">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <BarChart3 className="h-5 w-5 text-accent" />
                                <h3 className="font-bold text-white uppercase tracking-widest text-xs">Standard Configuration</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center group">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Risk Level</span>
                                    <div className={`px-3 py-1 rounded-full text-xs font-black border ${getRiskLevelColor(control.risk_level)}`}>
                                        {control.risk_level} / 5
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Frequency</span>
                                    <div className="flex items-center gap-2 text-white font-bold text-sm bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                                        <Calendar className="h-3.5 w-3.5 text-accent" />
                                        <span className="capitalize">{control.frequency}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Control Form</span>
                                    <span className="text-white font-bold text-sm capitalize">{control.control_form}</span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Owner Info */}
                        <motion.div variants={item} className="glass-card flex flex-col gap-6">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <User className="h-5 w-5 text-purple-400" />
                                <h3 className="font-bold text-white uppercase tracking-widest text-xs">Ownership & Responsibility</h3>
                            </div>

                            <div className="space-y-5">
                                <div className="flex gap-3 items-start">
                                    <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                                        {control.control_owner?.name?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Control Owner</p>
                                        <p className="text-sm font-bold text-white leading-snug">{control.control_owner?.name || 'Unassigned'}</p>
                                        <p className="text-xs text-slate-500">{control.control_owner?.email || ''}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                                        <Building2 className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Department / Position</p>
                                        <p className="text-sm font-bold text-white leading-snug">{control.department?.name || 'No Dept'}</p>
                                        <p className="text-xs text-slate-500 italic uppercase tracking-tighter text-[10px] font-bold mt-0.5">{control.process_owner_position || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Methodology / Refs */}
                        <motion.div variants={item} className="glass-card flex flex-col gap-6">
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <BookOpen className="h-5 w-5 text-amber-400" />
                                <h3 className="font-bold text-white uppercase tracking-widest text-xs">Methodology & Source</h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Methodology Ref</p>
                                    <p className="text-sm font-medium text-slate-300 bg-white/5 p-2 rounded-lg border border-white/5 font-mono truncate">{control.methodology_reference || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Data Source</p>
                                    <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-accent/30 pl-3">{control.data_source || 'Not specified'}</p>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Linked Risks */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="glass-card"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-emerald-400" />
                                Mitigated Risks
                            </h3>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-full border border-emerald-500/20">{linkedRisks.length}</span>
                        </div>

                        {/* Link Error Message */}
                        {linkError && (
                            <div className="mb-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {linkError}
                            </div>
                        )}

                        {/* Linked Risks Error State */}
                        {linkedRisksError ? (
                            <div className="py-10 text-center border-2 border-dashed border-rose-500/20 rounded-2xl bg-rose-500/5">
                                <AlertCircle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
                                <p className="text-xs text-rose-400 font-medium">{linkedRisksError}</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {activeLinkedRisks.length === 0 && archivedLinkedRisks.length === 0 ? (
                                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl col-span-full">
                                        <p className="text-xs text-slate-600 font-medium">No risks linked to this control.</p>
                                    </div>
                                ) : (
                                    <>
                                        {activeLinkedRisks.length > 0 && (
                                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                                {activeLinkedRisks.map((link) => (
                                                    <div
                                                        key={link.id}
                                                        onClick={(e) => handleRiskClick(link.risk_id, e)}
                                                        className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-accent/30 transition-all cursor-pointer relative"
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <span className="text-xs font-bold text-white line-clamp-1">{link.risk?.name || 'Unnamed Risk'}</span>
                                                                {link.risk?.process && <span className="text-[10px] text-slate-500 block mt-0.5">{link.risk.process}</span>}
                                                            </div>
                                                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${link.effectiveness === 'high' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                                                }`}>
                                                                {link.effectiveness}
                                                            </span>
                                                        </div>
                                                        {link.risk?.description && <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{link.risk.description}</p>}
                                                        {link.notes && <p className="mt-2 text-[10px] text-slate-500 font-medium italic">"{link.notes}"</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {archivedLinkedRisks.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                                                    Archived Risks ({archivedLinkedRisks.length})
                                                </h4>
                                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 opacity-70">
                                                    {archivedLinkedRisks.map((link) => (
                                                        <div
                                                            key={link.id}
                                                            onClick={(e) => handleRiskClick(link.risk_id, e)}
                                                            className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-accent/30 transition-all cursor-pointer relative"
                                                        >
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <span className="text-xs font-bold text-white line-clamp-1">{link.risk?.name || 'Unnamed Risk'}</span>
                                                                    {link.risk?.process && <span className="text-[10px] text-slate-500 block mt-0.5">{link.risk.process}</span>}
                                                                </div>
                                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${link.effectiveness === 'high' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                                                    }`}>
                                                                    {link.effectiveness}
                                                                </span>
                                                            </div>
                                                            {link.risk?.description && <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{link.risk.description}</p>}
                                                            {link.notes && <p className="mt-2 text-[10px] text-slate-500 font-medium italic">"{link.notes}"</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        <PermissionGate resource="controls" action="write">
                            <button
                                onClick={() => setIsLinkDialogOpen(true)}
                                className="w-full mt-4 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                            >
                                Manage Risk Linkage
                            </button>
                        </PermissionGate>

                        <LinkManagementDialog
                            isOpen={isLinkDialogOpen}
                            onClose={() => setIsLinkDialogOpen(false)}
                            mode="control-to-risk"
                            existingLinks={linkedRisks}
                            onLink={handleLinkRisk}
                            onUnlink={handleUnlinkRisk}
                        />

                        {/* Risk Quick View Modal */}
                        <RiskQuickViewModal
                            risk={selectedRisk}
                            isOpen={isRiskModalOpen}
                            onClose={() => {
                                setIsRiskModalOpen(false);
                                setSelectedRisk(null);
                            }}
                        />
                    </motion.div>
                </>
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
                            Execution Audit Trail
                        </h3>
                        <PermissionGate resource="controls" action="execute">
                            <button
                                onClick={() => setIsLogModalOpen(true)}
                                className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center gap-2 group-hover:shadow-[0_0_15px_rgba(30,132,255,0.2)]"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Log Execution
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
                onSuccess={() => setHistoryKey(prev => prev + 1)}
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
                        <div className="bg-[#0B1121] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Fetching Risk Details</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
