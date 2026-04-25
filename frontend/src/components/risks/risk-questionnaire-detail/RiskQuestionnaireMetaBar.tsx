import { Calendar, Clock } from 'lucide-react';

import { formatDateTimeValue, formatDateValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';

import type { TranslateFn } from './questionnairePresentation';

interface RiskQuestionnaireMetaBarProps {
    compareMode: boolean;
    isOverdue: boolean;
    locale: string;
    questionnaire: RiskQuestionnaireDetail;
    setCompareMode: (updater: (value: boolean) => boolean) => void;
    t: TranslateFn;
}

export function RiskQuestionnaireMetaBar({
    compareMode,
    isOverdue,
    locale,
    questionnaire,
    setCompareMode,
    t,
}: RiskQuestionnaireMetaBarProps) {
    return (
        <div className="mt-2 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                <span>{t('risks:questionnaire.meta.sent')}:</span>
                <span className="text-slate-300">{formatDateTimeValue(questionnaire.sent_at, locale)}</span>
                <span className="mx-2 opacity-30">•</span>
                <Calendar className="h-3.5 w-3.5" />
                <span>{t('risks:questionnaire.meta.due')}:</span>
                <span className={cn('text-slate-300', isOverdue && 'text-rose-400 font-bold')}>
                    {formatDateValue(questionnaire.due_at, locale)}
                </span>
                {isOverdue && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400">
                        {t('risks:questionnaire.status.overdue')}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <span>{t('risks:questionnaire.meta.status')}:</span>
                <span className="text-slate-300">{questionnaire.status}</span>
                <span className="mx-2 opacity-30">•</span>
                <span>{t('risks:questionnaire.meta.assignee')}:</span>
                <span className="text-slate-300">
                    {questionnaire.assigned_to_user_name ?? t('common:fallbacks.unknown_user')}
                </span>
                <span className="mx-2 opacity-30">•</span>
                <span>{t('risks:questionnaire.meta.sender')}:</span>
                <span className="text-slate-300">
                    {questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}
                </span>
                <span className="mx-2 opacity-30">•</span>
                <button
                    onClick={() => setCompareMode((value) => !value)}
                    className={cn(
                        'text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border transition-all',
                        compareMode
                            ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/20'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10',
                    )}
                >
                    {t('risks:questionnaire.compare_toggle')}
                </button>
            </div>
        </div>
    );
}
