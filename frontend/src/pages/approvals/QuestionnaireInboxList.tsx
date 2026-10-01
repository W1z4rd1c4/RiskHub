import { motion } from 'framer-motion';
import { CheckCircle2, Clock } from 'lucide-react';

import type { SafeTFunction } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';
import { cn } from '@/lib/utils';
import type { CollectionOutcome } from '@/pages/shared/collectionPageState';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

import { getQuestionnaireStatusBadge, getQuestionnaireStatusLabel } from './approvalsPresentation';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';

interface QuestionnaireInboxListProps {
    questionnaires: RiskQuestionnaireListItem[];
    outcome: CollectionOutcome;
    locale?: string;
    onOpenRisk: (riskId: number) => void;
    onRetry: () => void;
    t: SafeTFunction;
}

export function QuestionnaireInboxList({
    questionnaires,
    outcome,
    locale = 'en',
    onOpenRisk,
    onRetry,
    t,
}: QuestionnaireInboxListProps) {
    if (outcome.kind === 'initial-loading') {
        return (
            <LoadingState className="py-20" label={t('common:loading.generic')} />
        );
    }

    if (outcome.kind === 'denied') {
        return (
            <AccessDeniedState
                layout="section"
                descriptionKey="errors.questionnaire_access_denied"
                ns="approvals"
            />
        );
    }

    const hasStaleData = outcome.kind === 'stale-with-error';
    let loadError: string | null = null;
    if (outcome.kind === 'fatal-error') {
        loadError = t('approvals:errors.questionnaire_load_failed');
    } else if (outcome.kind === 'stale-with-error') {
        loadError = t('approvals:errors.questionnaire_stale');
    }
    const retrying = outcome.kind === 'fatal-error' || hasStaleData
        ? outcome.isRetrying
        : false;

    if (outcome.kind === 'empty') {
        return (
            <EmptyState
                icon={CheckCircle2}
                title={t('empty_state.all_caught_up')}
                description={t('empty_state.no_questionnaires')}
                className="rounded-2xl border-2 border-dashed border-border"
            />
        );
    }

    return (
        <div className="space-y-4">
            {loadError && (
                <>
                    <ErrorState
                        variant={hasStaleData ? 'banner' : 'block'}
                        message={loadError}
                        onRetry={onRetry}
                        isRetrying={retrying}
                    />
                    {retrying && <span role="status" className="sr-only">{t('approvals:status.questionnaire_retrying')}</span>}
                </>
            )}
            {(outcome.kind === 'content' || hasStaleData) && questionnaires.map((questionnaire) => (
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
                            <div className="text-xs text-muted-foreground">
                                {t('risks:questionnaire.meta.due')} {formatDateValue(questionnaire.due_at, locale)}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-foreground mb-1 truncate">
                                {questionnaire.risk_name ?? t('common:fallbacks.unknown_risk')}
                            </h3>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {t('risks:questionnaire.meta.sent')} {formatDateValue(questionnaire.sent_at, locale)}
                                </span>
                                <span>
                                    by{' '}
                                    <span className="text-accent-text">
                                        {questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}
                                    </span>
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onOpenRisk(questionnaire.risk_id)}
                                className="px-3 py-2 rounded-xl bg-tint/5 border border-border text-foreground hover:bg-tint/10 hover:border-tint/20 transition-all text-sm"
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
