import type { Dispatch, SetStateAction } from 'react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';

import type { RiskQuestionnaireQuestion } from '../riskQuestionnaireQuestions';
import type { QuestionnaireOption, TranslateFn } from './questionnairePresentation';

interface QuestionAnswerFieldProps {
    answers: Record<string, unknown>;
    getPreviousAnswer: (key: string) => unknown;
    isChanged: (key: string) => boolean;
    isEditable: boolean;
    likelihoodOptions: QuestionnaireOption[];
    likelihoodQuestionKey: string;
    missingKeys: string[];
    question: RiskQuestionnaireQuestion;
    renderAnswer: (key: string, value: unknown) => string;
    setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>;
    t: TranslateFn;
    worstCaseImpactOptions: QuestionnaireOption[];
    worstCaseImpactQuestionKey: string;
}

export function QuestionAnswerField({
    answers,
    getPreviousAnswer,
    isChanged,
    isEditable,
    likelihoodOptions,
    likelihoodQuestionKey,
    missingKeys,
    question,
    renderAnswer,
    setAnswers,
    t,
    worstCaseImpactOptions,
    worstCaseImpactQuestionKey,
}: QuestionAnswerFieldProps) {
    const label = t(`risks:questionnaire.questions.${question.key}`, question.key);
    const value = answers[question.key];
    const missing = missingKeys.includes(question.key);
    const spanFullWidth = question.type === 'textarea';
    const changed = isChanged(question.key);
    const helperText = question.helperTextKey ? t(`risks:${question.helperTextKey}`, '') : '';

    if (!isEditable) {
        return (
            <div className={cn('space-y-1', spanFullWidth && 'md:col-span-2')}>
                <QuestionLabel changed={changed} label={label} missing={missing} required={question.required} t={t} />
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white">
                    {renderAnswer(question.key, value)}
                </div>
                {changed && (
                    <div className="text-xs text-slate-500">
                        {t('risks:questionnaire.previous')}: {renderAnswer(question.key, getPreviousAnswer(question.key))}
                    </div>
                )}
                {helperText && (
                    <div className="text-xs text-slate-500">{helperText}</div>
                )}
            </div>
        );
    }

    return (
        <div className={cn('space-y-1', spanFullWidth && 'md:col-span-2')}>
            <QuestionLabel changed={changed} label={label} missing={missing} required={question.required} t={t} />

            {helperText && (
                <div className="text-xs text-slate-500">{helperText}</div>
            )}

            {(question.key === likelihoodQuestionKey || question.key === worstCaseImpactQuestionKey) && (
                <ThemedSelect
                    value={typeof value === 'number' ? String(value) : ''}
                    onValueChange={(nextValue) => {
                        setAnswers((current) => ({
                            ...current,
                            [question.key]: nextValue === '' ? undefined : Number.parseInt(nextValue, 10),
                        }));
                    }}
                    placeholder={t('common:actions.select')}
                    allowEmpty
                    emptyLabel={t('common:labels.none')}
                    className={cn(
                        missing && 'border-rose-500/40 focus:border-rose-500/60 focus:ring-rose-500/30',
                    )}
                    options={question.key === likelihoodQuestionKey ? likelihoodOptions : worstCaseImpactOptions}
                />
            )}

            {question.type === 'boolean' && (
                <ThemedSelect
                    value={typeof value === 'boolean' ? String(value) : ''}
                    onValueChange={(nextValue) => setAnswers((current) => ({ ...current, [question.key]: nextValue === 'true' }))}
                    placeholder={t('common:actions.select')}
                    allowEmpty
                    emptyLabel={t('common:labels.none')}
                    options={[
                        { value: 'true', label: t('common:actions.yes') },
                        { value: 'false', label: t('common:actions.no') },
                    ]}
                />
            )}

            {question.type === 'single_select' && (
                <ThemedSelect
                    value={typeof value === 'string' ? value : ''}
                    onValueChange={(nextValue) => setAnswers((current) => ({ ...current, [question.key]: nextValue }))}
                    placeholder={t('common:actions.select')}
                    allowEmpty
                    emptyLabel={t('common:labels.none')}
                    options={(question.options ?? []).map((option) => ({
                        value: option,
                        label: t(`risks:questionnaire.questions.${option}`, option),
                    }))}
                />
            )}

            {question.type === 'text' && (
                <input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                    className={cn(
                        'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all',
                        missing ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-white/10 focus:border-accent/50',
                    )}
                />
            )}

            {question.type === 'number' && question.key !== likelihoodQuestionKey && question.key !== worstCaseImpactQuestionKey && (
                <input
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    value={typeof value === 'number' ? String(value) : ''}
                    onChange={(event) => {
                        const raw = event.target.value;
                        setAnswers((current) => ({
                            ...current,
                            [question.key]: raw === '' ? undefined : Number.parseInt(raw, 10),
                        }));
                    }}
                    className={cn(
                        'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all',
                        missing ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-white/10 focus:border-accent/50',
                    )}
                />
            )}

            {question.type === 'textarea' && (
                <textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                    rows={3}
                    className={cn(
                        'w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all resize-none',
                        missing ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-white/10 focus:border-accent/50',
                    )}
                />
            )}

            {changed && (
                <div className="text-xs text-slate-500">
                    {t('risks:questionnaire.previous')}: {renderAnswer(question.key, getPreviousAnswer(question.key))}
                </div>
            )}
        </div>
    );
}

function QuestionLabel({
    changed,
    label,
    missing,
    required,
    t,
}: {
    changed: boolean;
    label: string;
    missing: boolean;
    required: boolean;
    t: TranslateFn;
}) {
    return (
        <div className="flex items-center gap-2">
            <p className={cn('text-xs font-bold', missing ? 'text-rose-400' : 'text-slate-300')}>
                {label}
            </p>
            {changed && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                    {t('risks:questionnaire.changed')}
                </span>
            )}
            {required && (
                <span className={cn('text-[10px] font-black uppercase tracking-widest', missing ? 'text-rose-400' : 'text-slate-500')}>
                    {t('risks:questionnaire.required')}
                </span>
            )}
        </div>
    );
}
