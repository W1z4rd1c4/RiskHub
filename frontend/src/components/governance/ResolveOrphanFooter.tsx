import { Loader2, ShieldAlert, UserCheck } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface ResolveOrphanFooterProps {
    canSubmit: boolean;
    errorKey: string | null;
    isKri: boolean;
    isProcessReassignment: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: () => void;
    selectedRiskId: number | null;
    requestReasonMissing: boolean;
    selectedDepartmentId: number | null;
    selectedUserId: number | null;
    shouldShowOwner: boolean;
    shouldShowRisk: boolean;
    shouldShowDepartment: boolean;
}

export function ResolveOrphanFooter({
    canSubmit,
    errorKey,
    isKri,
    isProcessReassignment,
    isSubmitting,
    onClose,
    onSubmit,
    selectedRiskId,
    requestReasonMissing,
    selectedDepartmentId,
    selectedUserId,
    shouldShowOwner,
    shouldShowRisk,
    shouldShowDepartment,
}: ResolveOrphanFooterProps) {
    const { t } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    let requirementMessageKey = 'governance.resolve_modal.verified_ready';
    if (shouldShowRisk && !selectedRiskId) {
        requirementMessageKey = 'governance.resolve_modal.risk_linkage_required';
    } else if (shouldShowOwner && !selectedUserId) {
        requirementMessageKey = 'governance.resolve_modal.owner_selection_required';
    } else if (shouldShowDepartment && !selectedDepartmentId) {
        requirementMessageKey = 'governance.resolve_modal.department_selection_required';
    } else if (requestReasonMissing) {
        requirementMessageKey = 'governance.resolve_modal.request_reason_required';
    }
    const requirementsMissing = requirementMessageKey !== 'governance.resolve_modal.verified_ready';

    let submitLabelKey = 'governance.resolve_modal.resolve_item';
    if (isSubmitting) {
        submitLabelKey = isProcessReassignment
            ? 'governance.resolve_modal.submitting_for_approval'
            : 'governance.resolve_modal.resolving';
    } else if (isProcessReassignment) {
        submitLabelKey = 'governance.resolve_modal.submit_for_approval';
    } else if (isKri) {
        submitLabelKey = 'governance.resolve_modal.link_risk';
    }

    return (
        <div className="p-6 border-t border-white/5 bg-white/5">
            {errorKey && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    {t(errorKey, { ns: 'errorKeys' })}
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className={`w-1.5 h-1.5 rounded-full ${
                                requirementsMissing ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                        />
                        {tAdmin(requirementMessageKey)}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                    >
                        {t('actions.cancel')}
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={!canSubmit}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-accent-foreground text-xs font-black uppercase tracking-widest rounded-xl hover:bg-accent-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg active:scale-95"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                        {tAdmin(submitLabelKey)}
                    </button>
                </div>
            </div>
        </div>
    );
}
