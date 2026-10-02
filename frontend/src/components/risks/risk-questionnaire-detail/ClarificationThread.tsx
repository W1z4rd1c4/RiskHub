import { formatDateTimeValue } from '@/i18n/formatters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RiskQuestionnaireClarification } from '@/types/riskQuestionnaire';

import type { TranslateFn } from './questionnairePresentation';

interface ClarificationThreadProps {
    clarifications: RiskQuestionnaireClarification[];
    isRiskOwner: boolean;
    locale: string;
    onRespond: (clarificationId: number) => void;
    onResponseMessageChange: (value: string) => void;
    onStartResponse: (clarificationId: number) => void;
    onCancelResponse: () => void;
    respondingClarificationId: number | null;
    responding: boolean;
    responseMessage: string;
    t: TranslateFn;
}

export function ClarificationThread({
    clarifications,
    isRiskOwner,
    locale,
    onRespond,
    onResponseMessageChange,
    onStartResponse,
    onCancelResponse,
    respondingClarificationId,
    responding,
    responseMessage,
    t,
}: ClarificationThreadProps) {
    if (clarifications.length === 0) return null;

    return (
        <div className="space-y-2">
            {clarifications.map((clarification) => {
                const open = !clarification.response_message;
                return (
                    <div key={clarification.id} className="p-4 rounded-lg border border-border bg-tint/5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-foreground">
                                {t('risks:questionnaire.clarification')}
                            </p>
                            {open && (
                                <Badge tone="warning" size="sm">
                                    {t('risks:questionnaire.clarification_open')}
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{clarification.request_message}</p>
                        <p className="text-xs text-muted-foreground">
                            {t('risks:questionnaire.clarification_requested_by')}{' '}
                            {clarification.requested_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                            {formatDateTimeValue(clarification.requested_at, locale)}
                        </p>

                        {clarification.response_message ? (
                            <div className="mt-3 border-t border-border pt-3 space-y-1">
                                <p className="text-xs font-bold text-foreground">
                                    {t('risks:questionnaire.clarification_response')}
                                </p>
                                <p className="text-sm text-foreground whitespace-pre-wrap">{clarification.response_message}</p>
                                {clarification.responded_at && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('risks:questionnaire.clarification_responded_by')}{' '}
                                        {clarification.responded_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                                        {formatDateTimeValue(clarification.responded_at, locale)}
                                    </p>
                                )}
                            </div>
                        ) : isRiskOwner ? (
                            <div className="mt-3 border-t border-border pt-3 space-y-2">
                                {respondingClarificationId !== clarification.id ? (
                                    <Button variant="outline" size="compact" onClick={() => onStartResponse(clarification.id)}>
                                        {t('risks:questionnaire.respond')}
                                    </Button>
                                ) : (
                                    <>
                                        <Textarea
                                            value={responseMessage}
                                            onChange={(event) => onResponseMessageChange(event.target.value)}
                                            rows={3}
                                            aria-label={t('risks:questionnaire.clarification_response_placeholder')}
                                            placeholder={t('risks:questionnaire.clarification_response_placeholder')}
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="secondary" size="compact" onClick={onCancelResponse} disabled={responding}>
                                                {t('common:actions.cancel')}
                                            </Button>
                                            <Button
                                                variant="accent"
                                                size="compact"
                                                onClick={() => onRespond(clarification.id)}
                                                disabled={responding || responseMessage.trim() === ''}
                                                isLoading={responding}
                                            >
                                                {t('common:actions.submit')}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
