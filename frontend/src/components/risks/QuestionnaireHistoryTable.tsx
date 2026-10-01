import { SortableTable, type Column } from '@/components/tables/SortableTable';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import type { TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';
import {
    formatQuestionnaireDate,
    questionnaireStatusBadge,
} from './questionnairesTabPresentation';

interface QuestionnaireHistoryTableProps {
    items: RiskQuestionnaireListItem[];
    loading: boolean;
    locale: string;
    onSelect: (id: number) => void;
    t: TranslateFn;
}

const CELL_TEXT = 'text-sm text-foreground';

/**
 * Questionnaire history (AX-02, D14): rows open the questionnaire in place, so
 * they use `SortableTable`'s `onRowActivate` (a named first-cell button with
 * Enter/Space; the row click is the mouse convenience). The table sits inside
 * the tab's card, so it renders without its own surface.
 */
export function QuestionnaireHistoryTable({
    items,
    loading,
    locale,
    onSelect,
    t,
}: QuestionnaireHistoryTableProps) {
    const columns: Column<RiskQuestionnaireListItem>[] = [
        {
            key: 'status',
            label: t('common:labels.status'),
            render: (questionnaire) =>
                questionnaireStatusBadge(questionnaire, t),
        },
        {
            key: 'sent_at',
            label: t('risks:questionnaires.columns.sent_at'),
            className: CELL_TEXT,
            render: (questionnaire) => formatQuestionnaireDate(questionnaire.sent_at, locale),
        },
        {
            key: 'due_at',
            label: t('risks:questionnaires.columns.due_at'),
            className: CELL_TEXT,
            render: (questionnaire) => formatQuestionnaireDate(questionnaire.due_at, locale),
        },
        {
            key: 'submitted_at',
            label: t('risks:questionnaires.columns.submitted_at'),
            className: CELL_TEXT,
            render: (questionnaire) => formatQuestionnaireDate(questionnaire.submitted_at, locale),
        },
        {
            key: 'sent_by_user_name',
            label: t('risks:questionnaires.columns.sent_by'),
            className: CELL_TEXT,
            render: (questionnaire) => questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user'),
        },
        {
            key: 'submitted_by_user_name',
            label: t('risks:questionnaires.columns.submitted_by'),
            className: CELL_TEXT,
            render: (questionnaire) =>
                questionnaire.submitted_by_user_name
                ?? (questionnaire.submitted_by_user_id ? t('common:fallbacks.unknown_user') : t('common:labels.none')),
        },
    ];

    return (
        <SortableTable
            surface="none"
            density="compact"
            data={items}
            columns={columns}
            keyExtractor={(questionnaire) => questionnaire.id}
            isLoading={loading}
            emptyMessage={t('risks:questionnaires.empty')}
            onRowActivate={(questionnaire) => onSelect(questionnaire.id)}
            rowActivateLabel={(questionnaire) =>
                t('risks:questionnaires.open_row', {
                    date: formatQuestionnaireDate(questionnaire.sent_at, locale),
                })}
        />
    );
}
