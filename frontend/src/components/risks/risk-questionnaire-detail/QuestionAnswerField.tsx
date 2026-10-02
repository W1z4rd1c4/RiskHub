import type { Dispatch, ReactNode, SetStateAction } from 'react';

import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
    /** Display text of an answer, or `null` when the question is not answered. */
    renderAnswer: (key: string, value: unknown) => string | null;
    setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>;
    t: TranslateFn;
    worstCaseImpactOptions: QuestionnaireOption[];
    worstCaseImpactQuestionKey: string;
}

/** An answer's text; an unanswered question reads a muted "Not answered" (GAP-B-24), never "Unknown". */
function AnswerText({ text, t }: { text: string | null; t: TranslateFn }) {
    return text === null
        ? <span className="italic text-muted-foreground">{t('risks:questionnaire.not_answered')}</span>
        : <>{text}</>;
}

/**
 * One questionnaire question. Editable: a `Field` (label, required `*`, help and
 * the announced "required" error wired to the control, D14) around the matching
 * `ui` control. Read-only: a `dt` / `dd` pair inside the section's `dl`. In compare
 * mode a changed answer shows the "Changed" badge with the previous answer.
 */
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
    const changeNote: ReactNode = changed ? (
        <span className="flex flex-wrap items-center gap-2">
            <Badge tone="info" size="sm">{t('risks:questionnaire.changed')}</Badge>{' '}
            <span>
                {t('risks:questionnaire.previous')}:{' '}
                <AnswerText text={renderAnswer(question.key, getPreviousAnswer(question.key))} t={t} />
            </span>
        </span>
    ) : null;

    if (!isEditable) {
        return (
            <div className={cn('space-y-1', spanFullWidth && 'md:col-span-2')}>
                <dt className="text-xs font-bold text-foreground">{label}</dt>
                <dd className="rounded-lg border border-border bg-tint/5 p-3 text-sm text-foreground">
                    <AnswerText text={renderAnswer(question.key, value)} t={t} />
                </dd>
                {changeNote ? <dd className="text-xs text-muted-foreground">{changeNote}</dd> : null}
                {helperText ? <dd className="text-xs text-muted-foreground">{helperText}</dd> : null}
            </div>
        );
    }

    const help = helperText || changeNote ? (
        <>
            {helperText ? <span className="block">{helperText}</span> : null}
            {changeNote ? <span className={cn('block', helperText && 'mt-1')}>{changeNote}</span> : null}
        </>
    ) : undefined;

    return (
        <div className={cn(spanFullWidth && 'md:col-span-2')} data-questionnaire-question={question.key}>
            <Field
                label={label}
                required={question.required}
                help={help}
                error={missing ? t('risks:questionnaire.validation_required') : undefined}
                labelClassName="text-xs font-bold"
            >
                {(field) => {
                    if (question.key === likelihoodQuestionKey || question.key === worstCaseImpactQuestionKey) {
                        return (
                            <ThemedSelect
                                {...field}
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
                                options={question.key === likelihoodQuestionKey ? likelihoodOptions : worstCaseImpactOptions}
                            />
                        );
                    }
                    if (question.type === 'boolean') {
                        return (
                            <ThemedSelect
                                {...field}
                                value={typeof value === 'boolean' ? String(value) : ''}
                                onValueChange={(nextValue) => setAnswers((current) => ({
                                    ...current,
                                    [question.key]: nextValue === '' ? undefined : nextValue === 'true',
                                }))}
                                placeholder={t('common:actions.select')}
                                allowEmpty
                                emptyLabel={t('common:labels.none')}
                                options={[
                                    { value: 'true', label: t('common:actions.yes') },
                                    { value: 'false', label: t('common:actions.no') },
                                ]}
                            />
                        );
                    }
                    if (question.type === 'single_select') {
                        return (
                            <ThemedSelect
                                {...field}
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
                        );
                    }
                    if (question.type === 'number') {
                        return (
                            <Input
                                {...field}
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
                            />
                        );
                    }
                    if (question.type === 'textarea') {
                        return (
                            <Textarea
                                {...field}
                                value={typeof value === 'string' ? value : ''}
                                onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                                rows={3}
                            />
                        );
                    }
                    return (
                        <Input
                            {...field}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                        />
                    );
                }}
            </Field>
        </div>
    );
}
