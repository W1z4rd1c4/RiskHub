import { formatDateTimeValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
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
    responseMessage,
    t,
}: ClarificationThreadProps) {
    if (clarifications.length === 0) return null;

    return (
        <div className="space-y-2">
            {clarifications.map((clarification) => {
                const open = !clarification.response_message;
                return (
                    <div key={clarification.id} className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-slate-300">
                                {t('risks:questionnaire.clarification')}
                            </p>
                            {open && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                    {t('risks:questionnaire.clarification_open')}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-white whitespace-pre-wrap">{clarification.request_message}</p>
                        <p className="text-[10px] text-slate-500">
                            {t('risks:questionnaire.clarification_requested_by')}{' '}
                            {clarification.requested_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                            {formatDateTimeValue(clarification.requested_at, locale)}
                        </p>

                        {clarification.response_message ? (
                            <div className="mt-3 border-t border-white/10 pt-3 space-y-1">
                                <p className="text-xs font-bold text-slate-300">
                                    {t('risks:questionnaire.clarification_response')}
                                </p>
                                <p className="text-sm text-white whitespace-pre-wrap">{clarification.response_message}</p>
                                {clarification.responded_at && (
                                    <p className="text-[10px] text-slate-500">
                                        {t('risks:questionnaire.clarification_responded_by')}{' '}
                                        {clarification.responded_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                                        {formatDateTimeValue(clarification.responded_at, locale)}
                                    </p>
                                )}
                            </div>
                        ) : isRiskOwner ? (
                            <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                                {respondingClarificationId !== clarification.id ? (
                                    <button
                                        onClick={() => onStartResponse(clarification.id)}
                                        className="text-xs text-accent hover:text-accent/80 font-bold"
                                    >
                                        {t('risks:questionnaire.respond')}
                                    </button>
                                ) : (
                                    <>
                                        <textarea
                                            value={responseMessage}
                                            onChange={(event) => onResponseMessageChange(event.target.value)}
                                            rows={3}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                            placeholder={t('risks:questionnaire.clarification_response_placeholder')}
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={onCancelResponse}
                                                className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                            >
                                                {t('common:actions.cancel')}
                                            </button>
                                            <button
                                                onClick={() => onRespond(clarification.id)}
                                                disabled={responseMessage.trim() === ''}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
                                                    'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50',
                                                    responseMessage.trim() === '' && 'opacity-50 cursor-not-allowed',
                                                )}
                                            >
                                                {t('common:actions.submit')}
                                            </button>
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
