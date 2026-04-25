import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import type { TranslateFn } from './risk-questionnaire-detail/questionnairePresentation';
import {
    formatQuestionnaireDate,
    isQuestionnaireOverdue,
    questionnaireStatusBadge,
} from './questionnairesTabPresentation';

interface QuestionnaireHistoryTableProps {
    items: RiskQuestionnaireListItem[];
    loading: boolean;
    locale: string;
    onSelect: (id: number) => void;
    t: TranslateFn;
}

export function QuestionnaireHistoryTable({
    items,
    loading,
    locale,
    onSelect,
    t,
}: QuestionnaireHistoryTableProps) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-white/5">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {t('common:labels.status')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {t('risks:questionnaires.columns.sent_at')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {t('risks:questionnaires.columns.due_at')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {t('risks:questionnaires.columns.submitted_at')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {t('risks:questionnaires.columns.sent_by')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {t('risks:questionnaires.columns.submitted_by')}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {loading ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-6 text-slate-400 text-sm">
                                {t('loading.generic')}
                            </td>
                        </tr>
                    ) : items.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-10 text-slate-500 text-sm">
                                {t('risks:questionnaires.empty')}
                            </td>
                        </tr>
                    ) : (
                        items.map((questionnaire) => (
                            <tr
                                key={questionnaire.id}
                                className="hover:bg-white/5 cursor-pointer"
                                onClick={() => onSelect(questionnaire.id)}
                            >
                                <td className="px-4 py-3">
                                    {questionnaireStatusBadge(questionnaire.status, isQuestionnaireOverdue(questionnaire), t)}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-300">
                                    {formatQuestionnaireDate(questionnaire.sent_at, locale)}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-300">
                                    {formatQuestionnaireDate(questionnaire.due_at, locale)}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-300">
                                    {formatQuestionnaireDate(questionnaire.submitted_at, locale)}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-300">
                                    {questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-300">
                                    {questionnaire.submitted_by_user_name
                                        ?? (questionnaire.submitted_by_user_id ? t('common:fallbacks.unknown_user') : t('common:labels.none'))}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
