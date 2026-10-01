import type { RiskQuestionnaireQuestion } from '../riskQuestionnaireQuestions';
import type { TranslateFn } from './questionnairePresentation';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ClarificationRequestPanelProps {
    onCancel: () => void;
    onQuestionKeysChange: (value: string[]) => void;
    onRequestMessageChange: (value: string) => void;
    onSubmit: () => void;
    pending: boolean;
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
    pending,
    questions,
    requestMessage,
    requestQuestionKeys,
    t,
}: ClarificationRequestPanelProps) {
    return (
        <div className="p-4 rounded-xl border border-border bg-tint/5 space-y-3">
            <Field label={t('risks:questionnaire.clarification_request_label')} labelClassName="text-xs font-bold">
                {(field) => (
                    <Textarea
                        {...field}
                        value={requestMessage}
                        onChange={(event) => onRequestMessageChange(event.target.value)}
                        rows={3}
                        placeholder={t('risks:questionnaire.clarification_request_placeholder')}
                    />
                )}
            </Field>
            <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    {t('risks:questionnaire.clarification_optional_questions')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {questions.map((question) => {
                        const label = t(`risks:questionnaire.questions.${question.key}`, question.key);
                        const checked = requestQuestionKeys.includes(question.key);
                        return (
                            <label key={question.key} className="flex items-start gap-2 text-xs text-foreground">
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
                    disabled={pending}
                    className="px-3 py-1.5 rounded-xl border border-border bg-tint/5 text-foreground text-[10px] font-black uppercase tracking-widest hover:bg-tint/10 transition-all"
                >
                    {t('common:actions.cancel')}
                </button>
                <button
                    onClick={onSubmit}
                    disabled={pending || requestMessage.trim() === ''}
                    className={cn(
                        'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
                        'bg-accent/20 border-accent/30 text-accent-text hover:bg-accent/30 hover:border-accent/50',
                        (pending || requestMessage.trim() === '') && 'opacity-50 cursor-not-allowed',
                    )}
                >
                    {t('common:actions.submit')}
                </button>
            </div>
        </div>
    );
}
