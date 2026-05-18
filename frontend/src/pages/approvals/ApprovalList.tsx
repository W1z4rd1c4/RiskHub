import { AnimatePresence, motion } from 'framer-motion';
import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Edit,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react';

import type { SafeTFunction } from '@/i18n/hooks';
import { formatDateValue, formatTimeValue } from '@/i18n/formatters';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '@/types/approval';

import { getApprovalActionBadge, getApprovalStatusBadge } from './approvalsPresentation';
import { approvalPendingChangeEntries, canViewApprovalPendingChanges } from './approvalPendingChanges';

interface ApprovalListProps {
    approvals: ApprovalRequest[];
    loading: boolean;
    expandedRows: Set<number>;
    currentUserId?: number | null;
    locale?: string;
    onToggleRow: (approvalId: number) => void;
    onApprove: (approval: ApprovalRequest) => void;
    onReject: (approval: ApprovalRequest) => void;
    onCancel: (approvalId: number) => void;
    t: SafeTFunction;
}

export function ApprovalList({
    approvals,
    loading,
    expandedRows,
    currentUserId: _currentUserId,
    locale = 'en',
    onToggleRow,
    onApprove,
    onReject,
    onCancel,
    t,
}: ApprovalListProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (approvals.length === 0) {
        return (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                <CheckCircle2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">{t('empty_state.all_caught_up')}</h3>
                <p className="text-slate-500 max-w-sm mx-auto">{t('empty_state.no_matching')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {approvals.map((approval) => {
                const canViewPendingChanges = canViewApprovalPendingChanges(approval);
                const pendingChangeEntries = approvalPendingChangeEntries(approval);

                return (
                    <motion.div
                        key={approval.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-0 overflow-hidden"
                    >
                    <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex flex-col gap-2 min-w-[120px]">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {approval.resource_type}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <span
                                    className={cn(
                                        'px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border flex items-center gap-1 w-fit',
                                        getApprovalActionBadge(approval.action_type),
                                    )}
                                >
                                    {approval.action_type === 'delete' ? (
                                        <Trash2 className="h-3 w-3" />
                                    ) : (
                                        <Edit className="h-3 w-3" />
                                    )}
                                    {approval.action_type}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1">
                            <h3 className="text-base font-bold text-white mb-1">{approval.resource_name}</h3>
                            <p className="text-sm text-slate-400 mb-2">
                                <span className="text-slate-600">Re:</span> {approval.reason}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDateValue(approval.created_at, locale)}
                                </span>
                                <span>
                                    by <span className="text-accent">{approval.requested_by_name}</span>
                                </span>
                            </div>

                            {(approval.status === 'approved' || approval.status === 'rejected') && approval.resolved_at && (
                                <div className="mt-3 pt-3 border-t border-white/5">
                                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-1">
                                        <span
                                            className={
                                                approval.status === 'approved'
                                                    ? 'text-emerald-400'
                                                    : 'text-rose-400'
                                            }
                                        >
                                            {approval.status === 'approved'
                                                ? t('labels.approved_on', {
                                                      date: formatDateValue(approval.resolved_at, locale),
                                                      time: formatTimeValue(approval.resolved_at, locale),
                                                  })
                                                : t('labels.rejected_on', {
                                                      date: formatDateValue(approval.resolved_at, locale),
                                                      time: formatTimeValue(approval.resolved_at, locale),
                                                  })}
                                        </span>
                                        {approval.resolved_by_name && (
                                            <span>
                                                by <span className="text-accent">{approval.resolved_by_name}</span>
                                            </span>
                                        )}
                                    </div>
                                    {approval.resolution_notes && (
                                        <p className="text-xs text-slate-400 italic">"{approval.resolution_notes}"</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 justify-between lg:justify-end min-w-[200px]">
                            <span
                                className={cn(
                                    'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border',
                                    getApprovalStatusBadge(approval.status),
                                )}
                            >
                                {approval.status}
                            </span>

                            <div className="flex items-center gap-2">
                                {canViewPendingChanges && (
                                    <button
                                        onClick={() => onToggleRow(approval.id)}
                                        className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                                        title={t('common:tooltips.view_changes')}
                                        aria-label={t('common:tooltips.view_changes')}
                                    >
                                        {expandedRows.has(approval.id) ? (
                                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                        )}
                                    </button>
                                )}

                                {(approval.status === 'pending' || approval.status === 'pending_privileged') && (
                                    <>
                                        {resolveCapabilityFlag(approval.capabilities, 'can_approve') && (
                                            <button
                                                onClick={() => onApprove(approval)}
                                                className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                                                title={t('common:actions.approve')}
                                                aria-label={t('common:actions.approve')}
                                            >
                                                <Check className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}
                                        {resolveCapabilityFlag(approval.capabilities, 'can_reject') && (
                                            <button
                                                onClick={() => onReject(approval)}
                                                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors border border-rose-500/20"
                                                title={t('common:actions.reject')}
                                                aria-label={t('common:actions.reject')}
                                            >
                                                <X className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}
                                    </>
                                )}

                                {resolveCapabilityFlag(
                                    approval.capabilities,
                                    'can_cancel',
                                ) && (
                                        <button
                                            onClick={() => onCancel(approval.id)}
                                            className="p-2 hover:bg-rose-500/10 hover:text-rose-400 text-slate-500 rounded-lg transition-colors"
                                            title={t('common:tooltips.cancel_request')}
                                            aria-label={t('common:tooltips.cancel_request')}
                                        >
                                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    )}
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {approval.action_type === 'edit' &&
                            expandedRows.has(approval.id) &&
                            canViewPendingChanges && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="bg-white/[0.02] border-t border-white/5 px-6 py-4"
                                >
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                                        {t('labels.proposed_changes')}
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {pendingChangeEntries.map(([field, change]) => (
                                            <div
                                                key={field}
                                                className="bg-black/20 rounded-lg p-3 border border-white/5"
                                            >
                                                <span className="block text-[10px] text-accent font-bold uppercase mb-1">
                                                    {field}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-rose-400 line-through opacity-70">
                                                        {String(change.old)}
                                                    </span>
                                                    <span className="text-slate-600">→</span>
                                                    <span className="text-emerald-400 font-bold">
                                                        {String(change.new)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                    </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
}
