import { FileText, Send, UserX } from 'lucide-react';

import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import { InlineMessage } from '@/components/ui/inline-message';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { cn } from '@/lib/utils';
import type { Risk } from '@/types/risk';

import { QuestionnaireAssessmentSummary } from './QuestionnaireAssessmentSummary';
import { QuestionnaireHistoryTable } from './QuestionnaireHistoryTable';
import { RiskQuestionnaireDetail } from './RiskQuestionnaireDetail';
import {
    formatQuestionnaireDate,
    questionnaireStatusBadge,
} from './questionnairesTabPresentation';
import { useRiskQuestionnairesTabData } from './useRiskQuestionnairesTabData';

interface RiskDetailQuestionnairesTabProps {
    risk: Risk;
}

export function RiskDetailQuestionnairesTab({ risk }: RiskDetailQuestionnairesTabProps) {
    const { t } = useTranslation(['common', 'risks']);
    const format = useFormat();
    const { totalAssets } = useTotalAssetsValue();
    const canSend = resolveCapabilityFlag(risk.capabilities, 'can_send_questionnaire');
    const {
        errorKey,
        handleSend,
        items,
        latestSubmitted,
        latestSubmittedLoading,
        latestSubmittedOutcome,
        loadOutcome,
        loading,
        message,
        openItem,
        reconcile,
        refresh,
        refreshLatestSubmitted,
        selectedId,
        sending,
        setSelectedId,
    } = useRiskQuestionnairesTabData({
        canSend,
        riskId: risk.id,
        t,
    });

    if (loadOutcome === 'fatal-error' || loadOutcome === 'denied') {
        return (
            <div className="glass-card !p-0 overflow-hidden">
                <TableErrorState
                    testId="risk-questionnaires-load-state"
                    message={t('common:errors.load_failed')}
                    onRetry={loadOutcome === 'fatal-error' ? () => void refresh() : undefined}
                    isRetrying={loading}
                />
            </div>
        );
    }

    return (
        <div className="glass-card !p-0 overflow-hidden">
            {message && (
                <InlineMessage tone="warning" className="m-4">{message}</InlineMessage>
            )}

            {loadOutcome === 'stale-with-error' ? (
                <TableErrorState
                    variant="banner"
                    testId="risk-questionnaires-load-state"
                    message={t('common:detail_load.stale_description')}
                    onRetry={() => void refresh()}
                    isRetrying={loading}
                />
            ) : null}

            {errorKey && loadOutcome === 'content' && (
                <InlineMessage tone="danger" className="m-4">{translateUiMessage(t, errorKey)}</InlineMessage>
            )}

            <div className="p-6 border-b border-border flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-accent" />
                        {t('risks:questionnaires.title')}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                        {t('risks:questionnaires.subtitle')}
                    </p>

                    {openItem && (
                        <div className="mt-3 flex items-center gap-3">
                            {questionnaireStatusBadge(openItem, t)}
                            <span className="text-xs text-muted-foreground">
                                {t('risks:questionnaires.current_due')}: {formatQuestionnaireDate(openItem.due_at, format.locale)}
                            </span>
                            <button
                                onClick={() => setSelectedId(openItem.id)}
                                className="text-xs text-accent-text hover:text-accent-text/80 font-bold"
                            >
                                {t('risks:questionnaires.open')}
                            </button>
                        </div>
                    )}
                </div>

                {canSend && (
                    <div className="flex flex-col items-end gap-2">
                        <button
                            onClick={handleSend}
                            disabled={sending || !risk.owner_id}
                            className={cn(
                                'inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all',
                                'bg-accent/20 border-accent/30 text-accent-text hover:bg-accent/30 hover:border-accent/50',
                                (sending || !risk.owner_id) && 'opacity-50 cursor-not-allowed',
                            )}
                            title={!risk.owner_id ? t('risks:questionnaires.send_requires_owner') : undefined}
                        >
                            {!risk.owner_id ? <UserX className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                            {t('risks:questionnaires.send')}
                        </button>
                        {!risk.owner_id && (
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.owner_required')}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <QuestionnaireAssessmentSummary
                latestSubmitted={latestSubmitted}
                latestSubmittedLoading={latestSubmittedLoading}
                loadOutcome={latestSubmittedOutcome}
                locale={format.locale}
                onRetry={() => void refreshLatestSubmitted()}
                t={t}
                totalAssets={totalAssets}
            />

            <QuestionnaireHistoryTable
                items={items}
                loading={loading}
                locale={format.locale}
                onSelect={setSelectedId}
                t={t}
            />

            <RiskQuestionnaireDetail
                isOpen={selectedId !== null}
                questionnaireId={selectedId}
                risk={risk}
                onClose={() => setSelectedId(null)}
                onChanged={reconcile}
            />
        </div>
    );
}
