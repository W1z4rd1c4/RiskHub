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
        <div className="p-6 border-t border-border bg-nested flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
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
                                    'bg-secondary border-border text-foreground hover:bg-secondary',
                                    'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:border-input disabled:border-dashed',
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
                                    'bg-accent border-accent text-accent-foreground hover:bg-accent-hover',
                                    'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:border-input disabled:border-dashed',
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-secondary text-foreground text-xs font-black uppercase tracking-widest hover:bg-secondary transition-all"
                >
                    {t('common:actions.close')}
                </button>
            </div>
        </div>
    );
}
