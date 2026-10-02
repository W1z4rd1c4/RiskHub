import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/hooks';
import { getQuestionnaireStatusMeta } from '@/lib/questionnaireStatus';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

interface QuestionnaireStatusBadgeProps extends Pick<BadgeProps, 'size' | 'className'> {
    questionnaire: Pick<RiskQuestionnaireListItem, 'status' | 'due_at'>;
}

/**
 * The questionnaire status pill (PG-20 / PG-03): tone and translated label from
 * the single map in `lib/questionnaireStatus.ts`; overdue wins over the stored
 * status. Used by the risk tab, the history table, the questionnaire dialog and
 * the approvals inbox.
 */
export function QuestionnaireStatusBadge({ questionnaire, size = 'sm', className }: QuestionnaireStatusBadgeProps) {
    const { t } = useTranslation('risks');
    const meta = getQuestionnaireStatusMeta(questionnaire);
    return (
        <Badge tone={meta.tone} size={size} className={className} data-questionnaire-status={meta.status ?? 'unknown'}>
            {t(meta.labelKey)}
        </Badge>
    );
}
