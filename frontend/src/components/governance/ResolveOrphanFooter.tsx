import { Loader2, ShieldAlert, UserCheck } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface ResolveOrphanFooterProps {
    canSubmit: boolean;
    errorKey: string | null;
    isKri: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: () => void;
    selectedRiskId: number | null;
    selectedUserId: number | null;
    shouldShowOwner: boolean;
    shouldShowRisk: boolean;
}

export function ResolveOrphanFooter({
    canSubmit,
    errorKey,
    isKri,
    isSubmitting,
    onClose,
    onSubmit,
    selectedRiskId,
    selectedUserId,
    shouldShowOwner,
    shouldShowRisk,
}: ResolveOrphanFooterProps) {
    const { t } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');

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
                        {(shouldShowRisk && !selectedRiskId) ? (
                            <>
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                {tAdmin('governance.resolve_modal.risk_linkage_required')}
                            </>
                        ) : (shouldShowOwner && !selectedUserId) ? (
                            <>
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                {tAdmin('governance.resolve_modal.owner_selection_required')}
                            </>
                        ) : (
                            <>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {tAdmin('governance.resolve_modal.verified_ready')}
                            </>
                        )}
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
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg active:scale-95"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                        {isSubmitting
                            ? tAdmin('governance.resolve_modal.resolving')
                            : (isKri
                                ? tAdmin('governance.resolve_modal.link_risk')
                                : tAdmin('governance.resolve_modal.resolve_item'))}
                    </button>
                </div>
            </div>
        </div>
    );
}
