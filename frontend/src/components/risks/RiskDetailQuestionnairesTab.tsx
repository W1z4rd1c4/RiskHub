import { AlertCircle, FileText, Send, UserX } from 'lucide-react';

import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { cn } from '@/lib/utils';
import type { Risk } from '@/types/risk';

import { QuestionnaireAssessmentSummary } from './QuestionnaireAssessmentSummary';
import { QuestionnaireHistoryTable } from './QuestionnaireHistoryTable';
import { RiskQuestionnaireDetail } from './RiskQuestionnaireDetail';
import {
    formatQuestionnaireDate,
    isQuestionnaireOverdue,
    questionnaireStatusBadge,
} from './questionnairesTabPresentation';
import { useRiskQuestionnairesTabData } from './useRiskQuestionnairesTabData';

interface RiskDetailQuestionnairesTabProps {
    risk: Risk;
}

export function RiskDetailQuestionnairesTab({ risk }: RiskDetailQuestionnairesTabProps) {
    const { t, i18n } = useTranslation(['common', 'risks']);
    const { totalAssets } = useTotalAssetsValue();
    const canSend = resolveCapabilityFlag(risk.capabilities, 'can_send_questionnaire');
    const {
        errorKey,
        handleSend,
        items,
        latestSubmitted,
        latestSubmittedLoading,
        loading,
        message,
        openItem,
        refresh,
        selectedId,
        sending,
        setSelectedId,
    } = useRiskQuestionnairesTabData({
        canSend,
        riskId: risk.id,
        t,
    });

    return (
        <div className="glass-card !p-0 overflow-hidden">
            {message && (
                <div className="p-4 border-b border-white/5 text-sm text-amber-400 bg-amber-500/5">
                    {message}
                </div>
            )}

            {errorKey && (
                <div className="p-4 border-b border-rose-500/20 text-sm text-rose-400 bg-rose-500/10 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {errorKey.startsWith('errorKeys.')
                        ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                        : t(errorKey)}
                </div>
            )}

            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-accent" />
                        {t('risks:questionnaires.title')}
                    </h3>
                    <p className="text-slate-500 text-sm">
                        {t('risks:questionnaires.subtitle')}
                    </p>

                    {openItem && (
                        <div className="mt-3 flex items-center gap-3">
                            {questionnaireStatusBadge(openItem.status, isQuestionnaireOverdue(openItem), t)}
                            <span className="text-xs text-slate-400">
                                {t('risks:questionnaires.current_due')}: {formatQuestionnaireDate(openItem.due_at, i18n.language)}
                            </span>
                            <button
                                onClick={() => setSelectedId(openItem.id)}
                                className="text-xs text-accent hover:text-accent/80 font-bold"
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
                                'bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50',
                                (sending || !risk.owner_id) && 'opacity-50 cursor-not-allowed',
                            )}
                            title={!risk.owner_id ? t('risks:questionnaires.send_requires_owner') : undefined}
                        >
                            {!risk.owner_id ? <UserX className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                            {t('risks:questionnaires.send')}
                        </button>
                        {!risk.owner_id && (
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.owner_required')}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <QuestionnaireAssessmentSummary
                latestSubmitted={latestSubmitted}
                latestSubmittedLoading={latestSubmittedLoading}
                locale={i18n.language}
                t={t}
                totalAssets={totalAssets}
            />

            <QuestionnaireHistoryTable
                items={items}
                loading={loading}
                locale={i18n.language}
                onSelect={setSelectedId}
                t={t}
            />

            <RiskQuestionnaireDetail
                isOpen={selectedId !== null}
                questionnaireId={selectedId}
                risk={risk}
                onClose={() => setSelectedId(null)}
                onChanged={refresh}
            />
        </div>
    );
}
