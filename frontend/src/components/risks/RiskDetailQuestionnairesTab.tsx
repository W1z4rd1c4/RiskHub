import { useId } from 'react';
import { FileText, Send, UserX } from 'lucide-react';

import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Risk } from '@/types/risk';

import { QuestionnaireAssessmentSummary } from './QuestionnaireAssessmentSummary';
import { QuestionnaireHistoryTable } from './QuestionnaireHistoryTable';
import { QuestionnaireStatusBadge } from './QuestionnaireStatusBadge';
import { RiskQuestionnaireDetail } from './RiskQuestionnaireDetail';
import { formatQuestionnaireDate } from './questionnairesTabPresentation';
import { useRiskQuestionnairesTabData } from './useRiskQuestionnairesTabData';

interface RiskDetailQuestionnairesTabProps {
    risk: Risk;
}

export function RiskDetailQuestionnairesTab({ risk }: RiskDetailQuestionnairesTabProps) {
    const { t } = useTranslation(['common', 'risks']);
    const format = useFormat();
    const { totalAssets } = useTotalAssetsValue();
    const canSend = resolveCapabilityFlag(risk.capabilities, 'can_send_questionnaire');
    const ownerRequiredId = useId();
    const {
        errorKey,
        handleSend,
        items,
        latestSubmitted,
        latestSubmittedLoading,
        latestSubmittedOutcome,
        loadOutcome,
        loading,
        openExistsNotice,
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
            <Card padding="none" className="overflow-hidden">
                <TableErrorState
                    testId="risk-questionnaires-load-state"
                    message={t('common:errors.load_failed')}
                    onRetry={loadOutcome === 'fatal-error' ? () => void refresh() : undefined}
                    isRetrying={loading}
                />
            </Card>
        );
    }

    const missingOwner = !risk.owner_id;

    return (
        <Card padding="none" className="overflow-hidden">
            {openExistsNotice ? (
                <InlineMessage tone="warning" className="m-4">{openExistsNotice}</InlineMessage>
            ) : null}

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

            <div className="p-6 border-b border-border">
                <CardHeader
                    className="mb-0"
                    icon={FileText}
                    title={t('risks:questionnaires.title')}
                    description={t('risks:questionnaires.subtitle')}
                    actions={canSend ? (
                        <div className="flex flex-col items-end gap-2">
                            <Button
                                variant="accent"
                                onClick={handleSend}
                                disabled={sending || missingOwner}
                                isLoading={sending}
                                aria-describedby={missingOwner ? ownerRequiredId : undefined}
                            >
                                {sending ? null : missingOwner ? <UserX aria-hidden="true" /> : <Send aria-hidden="true" />}
                                {t('risks:questionnaires.send')}
                            </Button>
                            {missingOwner && (
                                <p id={ownerRequiredId} className="text-xs text-muted-foreground">
                                    {t('risks:questionnaires.send_requires_owner')}
                                </p>
                            )}
                        </div>
                    ) : undefined}
                />

                {openItem && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <QuestionnaireStatusBadge questionnaire={openItem} />
                        <span className="text-xs text-muted-foreground">
                            {t('risks:questionnaires.current_due')}: {formatQuestionnaireDate(openItem.due_at, format.locale)}
                        </span>
                        <Button variant="outline" size="compact" onClick={() => setSelectedId(openItem.id)}>
                            {t('risks:questionnaires.open')}
                        </Button>
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
        </Card>
    );
}
