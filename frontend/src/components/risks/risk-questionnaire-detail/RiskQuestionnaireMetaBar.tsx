import { Calendar, Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatDateTimeValue, formatDateValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';

import { QuestionnaireStatusBadge } from '../QuestionnaireStatusBadge';
import type { TranslateFn } from './questionnairePresentation';

interface RiskQuestionnaireMetaBarProps {
    compareMode: boolean;
    isOverdue: boolean;
    locale: string;
    questionnaire: RiskQuestionnaireDetail;
    setCompareMode: (updater: (value: boolean) => boolean) => void;
    t: TranslateFn;
}

const META_ITEM_CLASS = 'flex items-center gap-1.5';

/**
 * Questionnaire meta line in the dialog header: a label/value list (sent, due,
 * status, assignee, sender) and the compare toggle. The status is the shared
 * translated badge (PG-03 / PG-20), which already reads "Overdue" past the due date.
 */
export function RiskQuestionnaireMetaBar({
    compareMode,
    isOverdue,
    locale,
    questionnaire,
    setCompareMode,
    t,
}: RiskQuestionnaireMetaBarProps) {
    return (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className={META_ITEM_CLASS}>
                    <dt className={META_ITEM_CLASS}>
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('risks:questionnaire.meta.sent')}:
                    </dt>
                    <dd className="text-foreground">{formatDateTimeValue(questionnaire.sent_at, locale)}</dd>
                </div>
                <div className={META_ITEM_CLASS}>
                    <dt className={META_ITEM_CLASS}>
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('risks:questionnaire.meta.due')}:
                    </dt>
                    <dd className={cn('text-foreground', isOverdue && 'font-bold text-destructive')}>
                        {formatDateValue(questionnaire.due_at, locale)}
                    </dd>
                </div>
                <div className={META_ITEM_CLASS}>
                    <dt>{t('risks:questionnaire.meta.status')}:</dt>
                    <dd><QuestionnaireStatusBadge questionnaire={questionnaire} /></dd>
                </div>
                <div className={META_ITEM_CLASS}>
                    <dt>{t('risks:questionnaire.meta.assignee')}:</dt>
                    <dd className="text-foreground">
                        {questionnaire.assigned_to_user_name ?? t('common:fallbacks.unknown_user')}
                    </dd>
                </div>
                <div className={META_ITEM_CLASS}>
                    <dt>{t('risks:questionnaire.meta.sender')}:</dt>
                    <dd className="text-foreground">
                        {questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}
                    </dd>
                </div>
            </dl>
            <Button
                variant="outline"
                size="compact"
                aria-pressed={compareMode}
                onClick={() => setCompareMode((value) => !value)}
                className="aria-pressed:border-accent/40 aria-pressed:bg-accent/15 aria-pressed:text-accent-text"
            >
                {t('risks:questionnaire.compare_toggle')}
            </Button>
        </div>
    );
}
