import { useEffect, useMemo, useState, useCallback } from 'react';
import { AlertCircle, FileText, Send, UserX } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireDetail as RiskQuestionnaireDetailType, RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { useAuthz } from '@/authz/useAuthz';
import { cn } from '@/lib/utils';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { RiskQuestionnaireDetail } from './RiskQuestionnaireDetail';
import { getRiskOwnerReassessmentQuestionKeys } from './riskQuestionnaireQuestions';
import { apiClient } from '@/services/apiClient';
import { formatDateValue } from '@/i18n/formatters';

interface RiskDetailQuestionnairesTabProps {
    risk: Risk;
}

function formatDate(value: string | null | undefined, locale: string) {
    if (!value) return '—';
    return formatDateValue(value, locale);
}

function isOverdue(item: RiskQuestionnaireListItem): boolean {
    if (item.status === 'submitted') return false;
    return new Date(item.due_at).getTime() < Date.now();
}

export function RiskDetailQuestionnairesTab({ risk }: RiskDetailQuestionnairesTabProps) {
    const { t, i18n } = useTranslation(['common', 'risks']);
    const authz = useAuthz();

    const [items, setItems] = useState<RiskQuestionnaireListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [latestSubmitted, setLatestSubmitted] = useState<RiskQuestionnaireDetailType | null>(null);
    const [latestSubmittedLoading, setLatestSubmittedLoading] = useState(false);

    const canSend = authz.canSendRiskQuestionnaires;

    const { totalAssets } = useTotalAssetsValue();

    const openItem = useMemo(
        () => items.find(i => i.status === 'sent' || i.status === 'in_progress') ?? null,
        [items]
    );

    const latestSubmittedItem = useMemo(() => {
        const submitted = items.filter(i => i.status === 'submitted' && i.submitted_at);
        if (!submitted.length) return null;
        return submitted.sort((a, b) => {
            const aTime = new Date(a.submitted_at as string).getTime();
            const bTime = new Date(b.submitted_at as string).getTime();
            return bTime - aTime;
        })[0];
    }, [items]);

    const latestSubmittedId = latestSubmittedItem?.id;

    useEffect(() => {
        let cancelled = false;
        const loadLatest = async () => {
            if (!latestSubmittedId) {
                setLatestSubmitted(null);
                return;
            }
            setLatestSubmittedLoading(true);
            try {
                const detail = await riskQuestionnairesApi.get(latestSubmittedId, { includePrevious: true });
                if (cancelled) return;
                setLatestSubmitted(detail);
            } catch {
                if (cancelled) return;
                setLatestSubmitted(null);
            } finally {
                if (!cancelled) setLatestSubmittedLoading(false);
            }
        };
        void loadLatest();
        return () => {
            cancelled = true;
        };
    }, [latestSubmittedId]);

    const statusBadge = (status: string, overdue: boolean) => {
        if (overdue) {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400">
                    {t('risks:questionnaire.status.overdue')}
                </span>
            );
        }
        if (status === 'sent') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-400">
                    {t('risks:questionnaire.status.sent')}
                </span>
            );
        }
        if (status === 'in_progress') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                    {t('risks:questionnaire.status.in_progress')}
                </span>
            );
        }
        if (status === 'submitted') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                    {t('risks:questionnaire.status.submitted')}
                </span>
            );
        }
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-white/5 border-white/10 text-slate-300">
                {status}
            </span>
        );
    };

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorKey(null);
        try {
            const data = await riskQuestionnairesApi.listForRisk(risk.id);
            setItems(data);
        } catch (e) {
            setErrorKey(apiClient.toUiMessageKey(e));
        } finally {
            setLoading(false);
        }
    }, [risk.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleSend = async () => {
        if (!canSend) return;
        setMessage(null);
        setErrorKey(null);
        setSending(true);
        try {
            await riskQuestionnairesApi.sendForRisk(risk.id);
            setMessage(t('risks:questionnaires.send_success'));
            await refresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.toLowerCase().includes('open questionnaire already exists')) {
                setMessage(t('risks:questionnaires.send_open_exists'));
                await refresh();
                if (openItem) setSelectedId(openItem.id);
                return;
            }
            setErrorKey(apiClient.toUiMessageKey(e));
        } finally {
            setSending(false);
        }
    };

    const normalizeForCompare = (value: unknown): unknown => {
        if (value === undefined || value === null) return null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed === '' ? null : trimmed;
        }
        return value;
    };

    const changedCount = useMemo(() => {
        if (!latestSubmitted?.previous_submission?.answers) return null;
        const current = (latestSubmitted.answers ?? {}) as Record<string, unknown>;
        const prev = (latestSubmitted.previous_submission.answers ?? {}) as Record<string, unknown>;
        const keys = getRiskOwnerReassessmentQuestionKeys(latestSubmitted.template_version);
        let count = 0;
        for (const key of keys) {
            const prevValue = normalizeForCompare(prev[key]);
            if (prevValue === null) continue;
            const curValue = normalizeForCompare(current[key]);
            if (curValue !== prevValue) count += 1;
        }
        return count;
    }, [latestSubmitted]);

    const latestLikelihood = (latestSubmitted?.answers?.['risk_assessment.q11_likelihood_12m'] ?? null) as number | null;
    const latestWorstCaseImpact = (latestSubmitted?.answers?.['risk_assessment.q12_worst_case_impact'] ?? null) as number | null;
    const worstCaseRange = latestWorstCaseImpact ? formatFinancialRange(latestWorstCaseImpact, totalAssets, t('risks:form.financial.no_loss')) : '';

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
                            {statusBadge(openItem.status, isOverdue(openItem))}
                            <span className="text-xs text-slate-400">
                                {t('risks:questionnaires.current_due')}: {formatDate(openItem.due_at, i18n.language)}
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
                                "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                                "bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50",
                                (sending || !risk.owner_id) && "opacity-50 cursor-not-allowed"
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

            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-3">
                    {t('risks:questionnaires.assessment_summary_title')}
                </h4>

                {latestSubmittedLoading ? (
                    <div className="text-sm text-slate-400">{t('loading.generic')}</div>
                ) : !latestSubmitted ? (
                    <div className="text-sm text-slate-500">
                        {t('risks:questionnaires.assessment_summary_empty')}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.assessment_summary_submitted_at')}
                            </p>
                            <p className="text-sm text-white">{formatDate(latestSubmitted.submitted_at, i18n.language)}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.assessment_summary_changed_count')}
                            </p>
                            <p className="text-sm text-white">
                                {changedCount === null ? '—' : `${changedCount}`}
                            </p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.assessment_summary_likelihood')}
                            </p>
                            <p className="text-sm text-white">{latestLikelihood ?? '—'}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.assessment_summary_worst_case_impact')}
                            </p>
                            <p className="text-sm text-white">
                                {latestWorstCaseImpact ? `${latestWorstCaseImpact}${worstCaseRange ? ` • ${worstCaseRange}` : ''}` : '—'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

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
                            items.map((q) => (
                                <tr
                                    key={q.id}
                                    className="hover:bg-white/5 cursor-pointer"
                                    onClick={() => setSelectedId(q.id)}
                                >
                                    <td className="px-4 py-3">
                                        {statusBadge(q.status, isOverdue(q))}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(q.sent_at, i18n.language)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(q.due_at, i18n.language)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(q.submitted_at, i18n.language)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{q.sent_by_user_name ?? t('common:fallbacks.unknown_user')}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">
                                        {q.submitted_by_user_name ?? (q.submitted_by_user_id ? t('common:fallbacks.unknown_user') : t('common:labels.none'))}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

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
