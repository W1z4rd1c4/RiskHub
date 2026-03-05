import { motion } from 'framer-motion';
import { CheckCircle2, Clock } from 'lucide-react';

import type { SafeTFunction } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import { getQuestionnaireStatusBadge, getQuestionnaireStatusLabel } from './approvalsPresentation';

interface QuestionnaireInboxListProps {
    loading: boolean;
    questionnaires: RiskQuestionnaireListItem[];
    onOpenRisk: (riskId: number) => void;
    t: SafeTFunction;
}

export function QuestionnaireInboxList({
    loading,
    questionnaires,
    onOpenRisk,
    t,
}: QuestionnaireInboxListProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (questionnaires.length === 0) {
        return (
            <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                <CheckCircle2 className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">{t('empty_state.all_caught_up')}</h3>
                <p className="text-slate-500 max-w-sm mx-auto">{t('empty_state.no_questionnaires')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {questionnaires.map((questionnaire) => (
                <motion.div
                    key={questionnaire.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-0 overflow-hidden"
                >
                    <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex flex-col gap-2 min-w-[140px]">
                            <span
                                className={cn(
                                    'px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border w-fit',
                                    getQuestionnaireStatusBadge(questionnaire),
                                )}
                            >
                                {getQuestionnaireStatusLabel(questionnaire, t)}
                            </span>
                            <div className="text-xs text-slate-500">
                                {t('risks:questionnaire.meta.due')} {new Date(questionnaire.due_at).toLocaleDateString()}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-white mb-1 truncate">
                                {questionnaire.risk_name ?? t('common:fallbacks.unknown_risk')}
                            </h3>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {t('risks:questionnaire.meta.sent')} {new Date(questionnaire.sent_at).toLocaleDateString()}
                                </span>
                                <span>
                                    by{' '}
                                    <span className="text-accent">
                                        {questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}
                                    </span>
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onOpenRisk(questionnaire.risk_id)}
                                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all text-sm"
                            >
                                {t('risks:questionnaires.open')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
