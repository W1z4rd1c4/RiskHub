import { Save, Send } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { TranslateFn } from './questionnairePresentation';

interface RiskQuestionnaireActionsProps {
    canSaveDraft: boolean;
    canSubmitQuestionnaire: boolean;
    isEditable: boolean;
    onClose: () => void;
    onSave: () => void;
    onSubmit: () => void;
    saving: boolean;
    submitting: boolean;
    t: TranslateFn;
}

export function RiskQuestionnaireActions({
    canSaveDraft,
    canSubmitQuestionnaire,
    isEditable,
    onClose,
    onSave,
    onSubmit,
    saving,
    submitting,
    t,
}: RiskQuestionnaireActionsProps) {
    return (
        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
                {!isEditable && (
                    <span>{t('risks:questionnaire.readonly_hint')}</span>
                )}
            </div>

            <div className="flex items-center gap-3">
                {isEditable && (
                    <>
                        {canSaveDraft && (
                            <button
                                onClick={onSave}
                                disabled={saving || submitting}
                                className={cn(
                                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all',
                                    'bg-white/5 border-white/10 text-white hover:bg-white/10',
                                    (saving || submitting) && 'opacity-50 cursor-not-allowed',
                                )}
                            >
                                <Save className="h-4 w-4" />
                                {t('risks:questionnaire.actions.save')}
                            </button>
                        )}
                        {canSubmitQuestionnaire && (
                            <button
                                onClick={onSubmit}
                                disabled={saving || submitting}
                                className={cn(
                                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all',
                                    'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50',
                                    (saving || submitting) && 'opacity-50 cursor-not-allowed',
                                )}
                            >
                                <Send className="h-4 w-4" />
                                {t('common:actions.submit')}
                            </button>
                        )}
                    </>
                )}

                <button
                    onClick={onClose}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                    {t('common:actions.close')}
                </button>
            </div>
        </div>
    );
}
