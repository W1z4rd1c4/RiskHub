import type { RiskQuestionnaireQuestion } from '../riskQuestionnaireQuestions';
import type { TranslateFn } from './questionnairePresentation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

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
    const messageMissing = requestMessage.trim() === '';
    return (
        <div className="p-4 rounded-lg border border-border bg-tint/5 space-y-3">
            <Field label={t('risks:questionnaire.clarification_request_label')} required labelClassName="text-xs font-bold">
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
            <fieldset className="space-y-2">
                <legend className="text-eyebrow">
                    {t('risks:questionnaire.clarification_optional_questions')}
                </legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {questions.map((question) => (
                        <Field
                            key={question.key}
                            layout="inline"
                            label={t(`risks:questionnaire.questions.${question.key}`, question.key)}
                            labelClassName="text-xs font-normal leading-snug"
                        >
                            {(field) => (
                                <Checkbox
                                    {...field}
                                    checked={requestQuestionKeys.includes(question.key)}
                                    onCheckedChange={(checked) => {
                                        const next = checked
                                            ? [...requestQuestionKeys, question.key]
                                            : requestQuestionKeys.filter((key) => key !== question.key);
                                        onQuestionKeysChange(next);
                                    }}
                                />
                            )}
                        </Field>
                    ))}
                </div>
            </fieldset>
            <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" size="compact" onClick={onCancel} disabled={pending}>
                    {t('common:actions.cancel')}
                </Button>
                <Button
                    variant="accent"
                    size="compact"
                    onClick={onSubmit}
                    disabled={pending || messageMissing}
                    isLoading={pending}
                >
                    {t('common:actions.submit')}
                </Button>
            </div>
        </div>
    );
}
