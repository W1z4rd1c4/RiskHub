import type { RiskQuestionnaireQuestion } from '../riskQuestionnaireQuestions';
import type { TranslateFn } from './questionnairePresentation';
import { cn } from '@/lib/utils';

interface ClarificationRequestPanelProps {
    onCancel: () => void;
    onQuestionKeysChange: (value: string[]) => void;
    onRequestMessageChange: (value: string) => void;
    onSubmit: () => void;
    questions: RiskQuestionnaireQuestion[];
    requestMessage: string;
    requestQuestionKeys: string[];
    t: TranslateFn;
}

export function ClarificationRequestPanel({
    onCancel,
    onQuestionKeysChange,
    onRequestMessageChange,
    onSubmit,
    questions,
    requestMessage,
    requestQuestionKeys,
    t,
}: ClarificationRequestPanelProps) {
    return (
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
            <p className="text-xs font-bold text-slate-300">
                {t('risks:questionnaire.clarification_request_label')}
            </p>
            <textarea
                value={requestMessage}
                onChange={(event) => onRequestMessageChange(event.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-accent/50 transition-all resize-none"
                placeholder={t('risks:questionnaire.clarification_request_placeholder')}
            />
            <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    {t('risks:questionnaire.clarification_optional_questions')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {questions.map((question) => {
                        const label = t(`risks:questionnaire.questions.${question.key}`, question.key);
                        const checked = requestQuestionKeys.includes(question.key);
                        return (
                            <label key={question.key} className="flex items-start gap-2 text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                        const next = event.target.checked
                                            ? [...requestQuestionKeys, question.key]
                                            : requestQuestionKeys.filter((key) => key !== question.key);
                                        onQuestionKeysChange(next);
                                    }}
                                />
                                <span className="leading-snug">{label}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
            <div className="flex items-center justify-end gap-2">
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                    {t('common:actions.cancel')}
                </button>
                <button
                    onClick={onSubmit}
                    disabled={requestMessage.trim() === ''}
                    className={cn(
                        'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
                        'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50',
                        requestMessage.trim() === '' && 'opacity-50 cursor-not-allowed',
                    )}
                >
                    {t('common:actions.submit')}
                </button>
            </div>
        </div>
    );
}
