import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/i18n/hooks';
import {
    CheckCircle2,
    Clock,
    ChevronDown,
    ChevronUp,
    Trash2,
    Edit,
    RotateCcw,
    Check,
    X
} from 'lucide-react';
import { approvalsApi } from '../services/approvalsApi';
import { apiClient } from '@/services/apiClient';
import type { ApprovalRequest, ApprovalActionType, ApprovalStatus } from '../types/approval';
import { usePermissions } from '../hooks/usePermissions';
import { cn } from '@/lib/utils';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
    const [questionnaires, setQuestionnaires] = useState<RiskQuestionnaireListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [questionnairesLoading, setQuestionnairesLoading] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'all' | 'mine' | 'risk_assessment'>('pending');
    const { canResolveApprovals: canResolve, user } = usePermissions();
    const { t } = useTranslation('approvals');
    const navigate = useNavigate();

    // Dialog State
    const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
    const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [cancelApprovalId, setCancelApprovalId] = useState<number | null>(null);

    // Expanded rows state (for edits)
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    const fetchApprovals = useCallback(async () => {
        try {
            setLoading(true);
            const params: { limit: number; status?: 'pending'; my_requests?: boolean } = { limit: 100 };

            if (filter === 'pending') {
                params.status = 'pending';
                // If not resolver, only fetch mine? Actually API handles logic, 
                // but let's be explicit if we want "My Pending" vs "All Pending"
                // The task requirement says "My Requests" tab vs "Pending" (Queue)
                if (!canResolve) {
                    params.my_requests = true;
                }
            } else if (filter === 'mine') {
                params.my_requests = true;
            }
            // 'all' fetches everything (history)

            const response = await approvalsApi.list(params);
            setApprovals(response.items);
            setErrorKey(null);
        } catch (error) {
            console.error('Failed to fetch approvals:', error);
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setLoading(false);
        }
    }, [filter, canResolve]);

    useEffect(() => {
        if (filter === 'risk_assessment') return;
        fetchApprovals();
    }, [filter, fetchApprovals]);

    const fetchQuestionnaires = useCallback(async () => {
        try {
            setQuestionnairesLoading(true);
            const items = await riskQuestionnairesApi.inbox();
            setQuestionnaires(items);
        } catch (error) {
            console.error('Failed to fetch questionnaire inbox:', error);
        } finally {
            setQuestionnairesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (filter !== 'risk_assessment') return;
        fetchQuestionnaires();
    }, [filter, fetchQuestionnaires]);

    const handleResolve = async () => {
        if (isSubmitting) return; // Guard against double-submit
        if (!selectedApproval || !dialogMode) return;
        if (!resolutionNotes.trim()) {
            setErrorKey('approvals:dialogs.resolution_required');
            return;
        }

        try {
            setIsSubmitting(true);
            if (dialogMode === 'approve') {
                await approvalsApi.approve(selectedApproval.id, { resolution_notes: resolutionNotes });
            } else {
                await approvalsApi.reject(selectedApproval.id, { resolution_notes: resolutionNotes });
            }
            // Refresh
            fetchApprovals();
            closeDialog();
        } catch (error: unknown) {
            console.error('Failed to resolve request:', error);
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = (id: number) => {
        setCancelApprovalId(id);
    };

    const handleConfirmCancel = async () => {
        if (cancelApprovalId === null) return;
        try {
            await approvalsApi.cancel(cancelApprovalId);
            fetchApprovals();
        } catch (error) {
            console.error('Failed to cancel request:', error);
            setErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setCancelApprovalId(null);
        }
    };

    const closeDialog = () => {
        setSelectedApproval(null);
        setDialogMode(null);
        setResolutionNotes('');
    };

    const toggleRow = (id: number) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const getStatusBadge = (status: ApprovalStatus) => {
        switch (status) {
            case 'pending': return 'text-amber-400 border-amber-400/20 bg-amber-400/5';
            case 'pending_privileged': return 'text-violet-400 border-violet-400/20 bg-violet-400/5';
            case 'approved': return 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
            case 'rejected': return 'text-rose-400 border-rose-400/20 bg-rose-400/5';
            case 'cancelled': return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
            default: return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
        }
    };

    const getActionBadge = (action: ApprovalActionType) => {
        switch (action) {
            case 'delete': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            case 'edit': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    const questionnaireStatusBadge = (q: RiskQuestionnaireListItem) => {
        const overdue = q.status !== 'submitted' && new Date(q.due_at).getTime() < Date.now();
        if (overdue) return 'text-rose-400 border-rose-400/20 bg-rose-400/5';
        if (q.status === 'sent') return 'text-amber-400 border-amber-400/20 bg-amber-400/5';
        if (q.status === 'in_progress') return 'text-accent border-accent/20 bg-accent/5';
        return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
    };

    const questionnaireStatusLabel = (q: RiskQuestionnaireListItem) => {
        const overdue = q.status !== 'submitted' && new Date(q.due_at).getTime() < Date.now();
        if (overdue) return t('risks:questionnaire.status.overdue');

        if (q.status === 'sent') return t('risks:questionnaire.status.sent');
        if (q.status === 'in_progress') return t('risks:questionnaire.status.in_progress');
        if (q.status === 'submitted') return t('risks:questionnaire.status.submitted');

        return q.status;
    };

    return (
        <div className="space-y-8 p-8">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-black text-white tracking-tighter mb-2">{t('title')}</h1>
                <p className="text-slate-500 font-medium">{t('page_subtitle')}</p>
            </div>

            {/* Filters */}
            {filter !== 'risk_assessment' && errorKey && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl flex items-center gap-2 mb-4">
                    <X className="h-5 w-5" />
                    <span>{errorKey.startsWith('errorKeys.') ? t(errorKey, { ns: 'errorKeys' }) : t(errorKey)}</span>
                    <button onClick={fetchApprovals} className="ml-auto text-sm underline hover:text-rose-300">{t('common:actions.retry')}</button>
                </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                <button
                    onClick={() => setFilter('pending')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'pending'
                            ? "bg-accent text-white shadow-lg shadow-accent/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    {t('tabs.pending')}
                </button>
                <button
                    onClick={() => setFilter('mine')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'mine'
                            ? "bg-accent text-white shadow-lg shadow-accent/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    {t('tabs.mine')}
                </button>
                <button
                    onClick={() => setFilter('risk_assessment')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'risk_assessment'
                            ? "bg-accent text-white shadow-lg shadow-accent/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    {t('tabs.risk_assessment')}
                </button>
                <button
                    onClick={() => setFilter('all')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'all'
                            ? "bg-accent text-white shadow-lg shadow-accent/20"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    {t('tabs.history')}
                </button>
            </div>

            {filter === 'risk_assessment' ? (
                <>
                    {questionnairesLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : questionnaires.length === 0 ? (
                        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                            <CheckCircle2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">{t('empty_state.all_caught_up')}</h3>
                            <p className="text-slate-500 max-w-sm mx-auto">{t('empty_state.no_questionnaires')}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {questionnaires.map(q => (
                                <motion.div
                                    key={q.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="glass-card p-0 overflow-hidden"
                                >
                                    <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                                        <div className="flex flex-col gap-2 min-w-[140px]">
                                            <span
                                                className={cn(
                                                    "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border w-fit",
                                                    questionnaireStatusBadge(q)
                                                )}
                                            >
                                                {questionnaireStatusLabel(q)}
                                            </span>
                                            <div className="text-xs text-slate-500">
                                                {t('risks:questionnaire.meta.due')} {new Date(q.due_at).toLocaleDateString()}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-white mb-1 truncate">
                                                {q.risk_name ?? t('common:fallbacks.unknown_risk')}
                                            </h3>
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {t('risks:questionnaire.meta.sent')} {new Date(q.sent_at).toLocaleDateString()}
                                                </span>
                                                <span>by <span className="text-accent">{q.sent_by_user_name ?? t('common:fallbacks.unknown_user')}</span></span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => navigate(`/risks/${q.risk_id}`)}
                                                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all text-sm"
                                            >
                                                {t('risks:questionnaires.open')}
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* List */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : approvals.length === 0 ? (
                        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                            <CheckCircle2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">{t('empty_state.all_caught_up')}</h3>
                            <p className="text-slate-500 max-w-sm mx-auto">{t('empty_state.no_matching')}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {approvals.map(approval => (
                        <motion.div
                            key={approval.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-card p-0 overflow-hidden"
                        >
                            <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                                {/* Type & Action Badges */}
                                <div className="flex flex-col gap-2 min-w-[120px]">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{approval.resource_type}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={cn(
                                            "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border flex items-center gap-1 w-fit",
                                            getActionBadge(approval.action_type)
                                        )}>
                                            {approval.action_type === 'delete' ? <Trash2 className="h-3 w-3" /> : <Edit className="h-3 w-3" />}
                                            {approval.action_type}
                                        </span>
                                    </div>
                                </div>

                                {/* Resource Info */}
                                <div className="flex-1">
                                    <h3 className="text-base font-bold text-white mb-1">{approval.resource_name}</h3>
                                    <p className="text-sm text-slate-400 mb-2">
                                        <span className="text-slate-600">Re:</span> {approval.reason}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {new Date(approval.created_at).toLocaleDateString()}
                                        </span>
                                        <span>by <span className="text-accent">{approval.requested_by_name}</span></span>
                                    </div>

                                    {/* Resolution info for approved/rejected */}
                                    {(approval.status === 'approved' || approval.status === 'rejected') && approval.resolved_at && (
                                        <div className="mt-3 pt-3 border-t border-white/5">
                                            <div className="flex items-center gap-4 text-xs text-slate-500 mb-1">
                                                <span className={approval.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}>
                                                    {approval.status === 'approved'
                                                        ? t('labels.approved_on', {
                                                            date: new Date(approval.resolved_at).toLocaleDateString(),
                                                            time: new Date(approval.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                        })
                                                        : t('labels.rejected_on', {
                                                            date: new Date(approval.resolved_at).toLocaleDateString(),
                                                            time: new Date(approval.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                        })
                                                    }
                                                </span>
                                                {approval.resolved_by_name && (
                                                    <span>by <span className="text-accent">{approval.resolved_by_name}</span></span>
                                                )}
                                            </div>
                                            {approval.resolution_notes && (
                                                <p className="text-xs text-slate-400 italic">
                                                    "{approval.resolution_notes}"
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Status & Actions */}
                                <div className="flex items-center gap-4 justify-between lg:justify-end min-w-[200px]">
                                    <span className={cn(
                                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                        getStatusBadge(approval.status)
                                    )}>
                                        {approval.status}
                                    </span>

                                    <div className="flex items-center gap-2">
                                        {approval.action_type === 'edit' && approval.pending_changes && (
                                            <button
                                                onClick={() => toggleRow(approval.id)}
                                                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                                                title={t('common:tooltips.view_changes')}
                                            >
                                                {expandedRows.has(approval.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            </button>
                                        )}

                                        {canResolve && (approval.status === 'pending' || approval.status === 'pending_privileged') && (
                                            <>
                                                <button
                                                    onClick={() => { setSelectedApproval(approval); setDialogMode('approve'); }}
                                                    className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                                                    title={t('common:actions.approve')}
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedApproval(approval); setDialogMode('reject'); }}
                                                    className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors border border-rose-500/20"
                                                    title={t('common:actions.reject')}
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </>
                                        )}

                                        {user?.id === approval.requested_by_id && (approval.status === 'pending' || approval.status === 'pending_privileged') && (
                                            <button
                                                onClick={() => handleCancel(approval.id)}
                                                className="p-2 hover:bg-rose-500/10 hover:text-rose-400 text-slate-500 rounded-lg transition-colors"
                                                title={t('common:tooltips.cancel_request')}
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Pending Changes Preview (Edit only) */}
                            <AnimatePresence>
                                {approval.action_type === 'edit' && expandedRows.has(approval.id) && approval.pending_changes && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="bg-white/[0.02] border-t border-white/5 px-6 py-4"
                                    >
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('labels.proposed_changes')}</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {Object.entries(approval.pending_changes).map(([field, change]) => (
                                                <div key={field} className="bg-black/20 rounded-lg p-3 border border-white/5">
                                                    <span className="block text-[10px] text-accent font-bold uppercase mb-1">{field}</span>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-rose-400 line-through opacity-70">{String(change.old)}</span>
                                                        <span className="text-slate-600">→</span>
                                                        <span className="text-emerald-400 font-bold">{String(change.new)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            )}
                </>
            )}

            {/* Resolution Dialog */}
            <AnimatePresence>
                {selectedApproval && dialogMode && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeDialog}
                            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-lg glass rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-6">
                                <h3 className="text-xl font-bold text-white mb-2">
                                    {dialogMode === 'approve' ? t('dialogs.approve_title') : t('dialogs.reject_title')}
                                </h3>
                                <p className="text-sm text-slate-400 mb-6">
                                    {t('dialogs.resolution_required')}
                                </p>

                                <textarea
                                    value={resolutionNotes}
                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                    placeholder={t('dialogs.resolution_placeholder')}
                                    className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-slate-600 outline-none focus:border-accent/50 resize-none"
                                />

                                <div className="flex justify-end gap-3 mt-6">
                                    <button
                                        onClick={closeDialog}
                                        className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                                    >
                                        {t('actions.cancel')}
                                    </button>
                                    <button
                                        onClick={handleResolve}
                                        disabled={isSubmitting || !resolutionNotes.trim()}
                                        className={cn(
                                            "px-6 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50",
                                            dialogMode === 'approve'
                                                ? "bg-emerald-500 hover:bg-emerald-600"
                                                : "bg-rose-500 hover:bg-rose-600"
                                        )}
                                    >
                                        {isSubmitting ? t('dialogs.processing') : (dialogMode === 'approve' ? t('actions.approve') : t('actions.reject'))}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <ConfirmDialog
                isOpen={cancelApprovalId !== null}
                onClose={() => setCancelApprovalId(null)}
                onConfirm={handleConfirmCancel}
                title={t('dialogs.cancel_title')}
                message={t('dialogs.cancel_message')}
                confirmLabel={t('common:actions.confirm')}
                variant="warning"
            />
        </div>
    );
}
