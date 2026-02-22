import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Calendar, Clock, FileText, Save, Send, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireClarification, RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { IMPACT_DESCRIPTIONS, PROBABILITY_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { cn } from '@/lib/utils';
import { getRiskOwnerReassessmentTemplate } from '../riskQuestionnaireQuestions';

interface RiskQuestionnaireDetailProps {
    isOpen: boolean;
    onClose: () => void;
    questionnaireId: number | null;
    risk: Risk;
    onChanged?: () => void;
}

function isMissingAnswer(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
}

const LIKELIHOOD_12M_KEY = 'risk_assessment.q11_likelihood_12m';
const WORST_CASE_IMPACT_KEY = 'risk_assessment.q12_worst_case_impact';

export function RiskQuestionnaireDetail({
    isOpen,
    onClose,
    questionnaireId,
    risk,
    onChanged,
}: RiskQuestionnaireDetailProps) {
    const { t } = useTranslation(['common', 'risks']);
    const { user } = useAuth();
    const authz = useAuthz();
    const { totalAssets } = useTotalAssetsValue();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [questionnaire, setQuestionnaire] = useState<RiskQuestionnaireDetail | null>(null);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [missingKeys, setMissingKeys] = useState<string[]>([]);
    const [compareMode, setCompareMode] = useState(false);
    const [clarifications, setClarifications] = useState<RiskQuestionnaireClarification[]>([]);
    const [clarificationsLoading, setClarificationsLoading] = useState(false);
    const [requestingSectionKey, setRequestingSectionKey] = useState<string | null>(null);
    const [requestMessage, setRequestMessage] = useState('');
    const [requestQuestionKeys, setRequestQuestionKeys] = useState<string[]>([]);
    const [respondingClarificationId, setRespondingClarificationId] = useState<number | null>(null);
    const [responseMessage, setResponseMessage] = useState('');

    const isOverdue = useMemo(() => {
        if (!questionnaire) return false;
        if (questionnaire.status === 'submitted') return false;
        return new Date(questionnaire.due_at).getTime() < Date.now();
    }, [questionnaire]);

    const canSubmit = useMemo(() => {
        if (!user) return false;
        if (!risk.owner_id || !risk.department_id) {
            return user.id === risk.owner_id;
        }
        if (user.id === risk.owner_id) return true;
        return authz.isDepartmentHead && user.department_id === risk.department_id;
    }, [authz.isDepartmentHead, risk.department_id, risk.owner_id, user]);

    const isEditable = canSubmit && questionnaire?.status !== 'submitted';

    const defaultCompareMode = false;

    const templateVersion = questionnaire?.template_version ?? 'v1';
    const template = useMemo(() => getRiskOwnerReassessmentTemplate(templateVersion), [templateVersion]);
    const templateQuestionKeys = useMemo(
        () => new Set(template.flatMap(s => s.questions).map(q => q.key)),
        [template]
    );

    const canRequestClarification = authz.canRequestRiskClarification;
    const isRiskOwner = !!user && questionnaire?.assigned_to_user_id === user.id;

	    useEffect(() => {
	        let cancelled = false;

	        const load = async () => {
	            if (!isOpen || !questionnaireId) return;
		            setErrorKey(null);
	            setMissingKeys([]);
	            setLoading(true);
	            try {
	                let data = await riskQuestionnairesApi.get(questionnaireId, { includePrevious: defaultCompareMode });
	                if (canSubmit && data.status === 'sent') {
	                    try {
	                        data = await riskQuestionnairesApi.open(questionnaireId, { includePrevious: defaultCompareMode });
	                    } catch {
	                        // best-effort: keep the read-only view if open fails
	                    }
	                }
	                if (cancelled) return;
	                setQuestionnaire(data);
	                const nextAnswers = (data.answers ?? {}) as Record<string, unknown>;
	                setAnswers(nextAnswers);
	                setCompareMode(defaultCompareMode);
	            } catch (e) {
	                if (cancelled) return;
		                setErrorKey(apiClient.toUiMessageKey(e));
	            } finally {
	                if (!cancelled) setLoading(false);
	            }
	        };

        load();
	        return () => {
	            cancelled = true;
	        };
		    }, [canSubmit, defaultCompareMode, isOpen, questionnaireId]);

    useEffect(() => {
        let cancelled = false;
        const loadPreviousIfNeeded = async () => {
            if (!isOpen || !questionnaireId) return;
            if (!compareMode) return;
            if (questionnaire?.previous_submission !== undefined) return;
            try {
                const data = await riskQuestionnairesApi.get(questionnaireId, { includePrevious: true });
                if (cancelled) return;
                setQuestionnaire(prev => (prev ? { ...prev, previous_submission: data.previous_submission } : data));
            } catch {
                // best-effort
            }
        };
        loadPreviousIfNeeded();
        return () => {
            cancelled = true;
        };
    }, [compareMode, isOpen, questionnaire?.previous_submission, questionnaireId]);

    useEffect(() => {
        let cancelled = false;
        const loadClarifications = async () => {
            if (!isOpen || !questionnaireId) return;
            setClarificationsLoading(true);
            try {
                const data = await riskQuestionnairesApi.listClarifications(questionnaireId);
                if (cancelled) return;
                setClarifications(data);
            } catch {
                if (cancelled) return;
                setClarifications([]);
            } finally {
                if (!cancelled) setClarificationsLoading(false);
            }
        };
        loadClarifications();
        return () => {
            cancelled = true;
        };
    }, [isOpen, questionnaireId]);

    const validate = () => {
        const required = template.flatMap(s => s.questions).filter(q => q.required);
        const missing = required
            .filter(q => isMissingAnswer(answers[q.key]))
            .map(q => q.key);
        setMissingKeys(missing);
        return missing.length === 0;
    };

    const handleSave = async () => {
        if (!questionnaire) return;
        setSaving(true);
        setErrorKey(null);
        try {
            const updated = await riskQuestionnairesApi.saveDraft(questionnaire.id, answers);
            setQuestionnaire(updated);
            onChanged?.();
        } catch (e) {
            setErrorKey(apiClient.toUiMessageKey(e));
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!questionnaire) return;
        setErrorKey(null);
        if (!validate()) {
            setErrorKey('risks:questionnaire.validation_missing');
            return;
        }
        setSubmitting(true);
        try {
            const updated = await riskQuestionnairesApi.submit(questionnaire.id, answers);
            setQuestionnaire(updated);
            onChanged?.();
        } catch (e) {
            setErrorKey(apiClient.toUiMessageKey(e));
        } finally {
            setSubmitting(false);
        }
    };

    const formatLikelihoodOptionLabel = (level: number): string => {
        const meta = PROBABILITY_DESCRIPTIONS[level];
        if (!meta) return String(level);
        return `${level} — ${t(meta.labelKey, meta.labelKey)} — ${t(meta.descriptionKey, meta.descriptionKey)}`;
    };

    const formatWorstCaseImpactOptionLabel = (level: number): string => {
        const meta = IMPACT_DESCRIPTIONS[level];
        if (!meta) return String(level);
        const range = formatFinancialRange(level, totalAssets, t('risks:form.financial.no_loss'));
        return `${level} — ${t(meta.labelKey, meta.labelKey)} — ${t(meta.descriptionKey, meta.descriptionKey)}. ${t('risks:form.financial.loss')}: ${range}`;
    };

    const likelihoodOptions = [1, 2, 3, 4, 5].map(level => ({
        value: String(level),
        label: formatLikelihoodOptionLabel(level),
    }));

    const worstCaseImpactOptions = [1, 2, 3, 4, 5].map(level => ({
        value: String(level),
        label: formatWorstCaseImpactOptionLabel(level),
    }));

    const renderAnswer = (key: string, value: unknown) => {
        if (value === undefined || value === null) return t('labels.unknown');
        if (typeof value === 'boolean') return value ? t('actions.yes') : t('actions.no');
        if (key === LIKELIHOOD_12M_KEY) {
            const level = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
            if (Number.isFinite(level)) return formatLikelihoodOptionLabel(level);
        }
        if (key === WORST_CASE_IMPACT_KEY) {
            const level = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
            if (Number.isFinite(level)) return formatWorstCaseImpactOptionLabel(level);
        }
        if (typeof value === 'string') {
            // Handle select option translation keys
            if (value.startsWith('risk_assessment.options.')) {
                return t(`risks:questionnaire.questions.${value}`, value);
            }
            return value;
        }
        return String(value);
    };

    const normalizeForCompare = (value: unknown): unknown => {
        if (value === undefined || value === null) return null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed === '' ? null : trimmed;
        }
        return value;
    };

    const getPreviousAnswer = (key: string): unknown => {
        const prevAnswers = (questionnaire?.previous_submission?.answers ?? {}) as Record<string, unknown>;
        return prevAnswers[key];
    };

    const isChanged = (key: string): boolean => {
        if (!compareMode) return false;
        if (!templateQuestionKeys.has(key)) return false;
        const prev = normalizeForCompare(getPreviousAnswer(key));
        if (prev === null) return false;
        const cur = normalizeForCompare(answers[key]);
        return cur !== prev;
    };

    const hasPreviousCycle = questionnaire?.previous_submission !== null;
    const previousCycleLoaded = questionnaire?.previous_submission !== undefined;

    const sectionClarifications = useMemo(() => {
        const grouped = new Map<string, RiskQuestionnaireClarification[]>();
        for (const c of clarifications) {
            const list = grouped.get(c.section_key) ?? [];
            list.push(c);
            grouped.set(c.section_key, list);
        }
        return grouped;
    }, [clarifications]);

    const handleRequestClarification = async (sectionKey: string) => {
        if (!questionnaire) return;
        setErrorKey(null);
        try {
            await riskQuestionnairesApi.createClarification(questionnaire.id, {
                section_key: sectionKey,
                request_message: requestMessage.trim(),
                question_keys: requestQuestionKeys.length ? requestQuestionKeys : undefined,
            });
            const data = await riskQuestionnairesApi.listClarifications(questionnaire.id);
            setClarifications(data);
            setRequestingSectionKey(null);
            setRequestMessage('');
            setRequestQuestionKeys([]);
        } catch (e) {
            setErrorKey(apiClient.toUiMessageKey(e));
        }
    };

    const handleRespondClarification = async (clarificationId: number) => {
        if (!questionnaire) return;
        setErrorKey(null);
        try {
            await riskQuestionnairesApi.respondClarification(questionnaire.id, clarificationId, {
                response_message: responseMessage.trim(),
            });
            const data = await riskQuestionnairesApi.listClarifications(questionnaire.id);
            setClarifications(data);
            setRespondingClarificationId(null);
            setResponseMessage('');
        } catch (e) {
            setErrorKey(apiClient.toUiMessageKey(e));
        }
    };

    const close = () => {
        setErrorKey(null);
        setMissingKeys([]);
        setRequestingSectionKey(null);
        setRequestMessage('');
        setRequestQuestionKeys([]);
        setRespondingClarificationId(null);
        setResponseMessage('');
        onClose();
    };

    const portalContent: ReactNode = (
        <AnimatePresence>
            {isOpen && questionnaireId && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 backdrop-blur-sm z-[100] bg-black/40"
                        onClick={close}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 10 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="fixed inset-0 z-[101] p-4 flex items-center justify-center"
                    >
                        <div className="w-full max-w-3xl glass-card !p-0 overflow-hidden shadow-2xl">
                            <div className="flex items-start justify-between p-6 border-b border-white/5">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-accent" />
                                        {t('risks:questionnaire.title')}
                                    </h3>
                                    {questionnaire && (
                                        <div className="mt-2 text-xs text-slate-500 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-3.5 w-3.5" />
                                                <span>{t('risks:questionnaire.meta.sent')}:</span>
                                                <span className="text-slate-300">{new Date(questionnaire.sent_at).toLocaleString()}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <Calendar className="h-3.5 w-3.5" />
                                                <span>{t('risks:questionnaire.meta.due')}:</span>
                                                <span className={cn("text-slate-300", isOverdue && "text-rose-400 font-bold")}>
                                                    {new Date(questionnaire.due_at).toLocaleDateString()}
                                                </span>
                                                {isOverdue && (
                                                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400">
                                                        {t('risks:questionnaire.status.overdue')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span>{t('risks:questionnaire.meta.status')}:</span>
                                                <span className="text-slate-300">{questionnaire.status}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <span>{t('risks:questionnaire.meta.assignee')}:</span>
                                                <span className="text-slate-300">{questionnaire.assigned_to_user_name ?? t('common:fallbacks.unknown_user')}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <span>{t('risks:questionnaire.meta.sender')}:</span>
                                                <span className="text-slate-300">{questionnaire.sent_by_user_name ?? t('common:fallbacks.unknown_user')}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <button
                                                    onClick={() => setCompareMode(v => !v)}
                                                    className={cn(
                                                        "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border transition-all",
                                                        compareMode
                                                            ? "bg-accent/15 border-accent/30 text-accent hover:bg-accent/20"
                                                            : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                                    )}
                                                >
                                                    {t('risks:questionnaire.compare_toggle')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={close}
                                    className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 max-h-[70vh] overflow-y-auto">
                                {loading ? (
                                    <div className="text-slate-400">{t('loading.generic')}</div>
                                ) : errorKey ? (
                                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-2">
                                        <AlertCircle className="h-4 w-4 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-medium">
                                                {errorKey.startsWith('errorKeys.')
                                                    ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                                                    : t(errorKey)}
                                            </p>
                                            {missingKeys.length > 0 && (
                                                <ul className="mt-2 list-disc list-inside text-xs text-rose-300/80">
                                                    {missingKeys.map(k => (
                                                        <li key={k}>{t(`risks:questionnaire.questions.${k}`, k)}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                ) : questionnaire ? (
                                    <div className="space-y-6">
                                        {compareMode && previousCycleLoaded && !hasPreviousCycle && (
                                            <div className="text-xs text-slate-500">
                                                {t('risks:questionnaire.no_previous_cycle')}
                                            </div>
                                        )}

                                        {template.map(section => (
                                            <section key={section.titleKey} className="space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h4 className="text-xs font-black text-white uppercase tracking-widest">
                                                        {t(`risks:${section.titleKey}`, section.titleKey)}
                                                    </h4>
                                                    {canRequestClarification && questionnaire.status === 'submitted' && (
                                                        <button
                                                            onClick={() => {
                                                                setRequestingSectionKey(section.titleKey);
                                                                setRequestMessage('');
                                                                setRequestQuestionKeys([]);
                                                            }}
                                                            className="text-[10px] font-black uppercase tracking-widest text-accent hover:text-accent/80"
                                                        >
                                                            {t('risks:questionnaire.request_clarification')}
                                                        </button>
                                                    )}
                                                </div>

                                                {requestingSectionKey === section.titleKey && (
                                                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                                                        <p className="text-xs font-bold text-slate-300">
                                                            {t('risks:questionnaire.clarification_request_label')}
                                                        </p>
                                                        <textarea
                                                            value={requestMessage}
                                                            onChange={(e) => setRequestMessage(e.target.value)}
                                                            rows={3}
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                                            placeholder={t('risks:questionnaire.clarification_request_placeholder')}
                                                        />
                                                        <div className="space-y-2">
                                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                                {t('risks:questionnaire.clarification_optional_questions')}
                                                            </p>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                {section.questions.map(q => {
                                                                    const label = t(`risks:questionnaire.questions.${q.key}`, q.key);
                                                                    const checked = requestQuestionKeys.includes(q.key);
                                                                    return (
                                                                        <label key={q.key} className="flex items-start gap-2 text-xs text-slate-300">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={checked}
                                                                                onChange={(e) => {
                                                                                    const next = e.target.checked
                                                                                        ? [...requestQuestionKeys, q.key]
                                                                                        : requestQuestionKeys.filter(k => k !== q.key);
                                                                                    setRequestQuestionKeys(next);
                                                                                }}
                                                                            />
                                                                            <span className="leading-snug">{label}</span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => setRequestingSectionKey(null)}
                                                                className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                                            >
                                                                {t('common:actions.cancel')}
                                                            </button>
                                                            <button
                                                                onClick={() => handleRequestClarification(section.titleKey)}
                                                                disabled={requestMessage.trim() === ''}
                                                                className={cn(
                                                                    "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                                                    "bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50",
                                                                    requestMessage.trim() === '' && "opacity-50 cursor-not-allowed"
                                                                )}
                                                            >
                                                                {t('common:actions.submit')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {clarificationsLoading ? null : (sectionClarifications.get(section.titleKey)?.length ?? 0) > 0 ? (
                                                    <div className="space-y-2">
                                                        {sectionClarifications.get(section.titleKey)!.map(c => {
                                                            const open = !c.response_message;
                                                            return (
                                                                <div key={c.id} className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <p className="text-xs font-bold text-slate-300">
                                                                            {t('risks:questionnaire.clarification')}
                                                                        </p>
                                                                        {open && (
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                                                                {t('risks:questionnaire.clarification_open')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-sm text-white whitespace-pre-wrap">{c.request_message}</p>
                                                                    <p className="text-[10px] text-slate-500">
                                                                        {t('risks:questionnaire.clarification_requested_by')}{' '}
                                                                        {c.requested_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                                                                        {new Date(c.requested_at).toLocaleString()}
                                                                    </p>

                                                                    {c.response_message ? (
                                                                        <div className="mt-3 border-t border-white/10 pt-3 space-y-1">
                                                                            <p className="text-xs font-bold text-slate-300">
                                                                                {t('risks:questionnaire.clarification_response')}
                                                                            </p>
                                                                            <p className="text-sm text-white whitespace-pre-wrap">{c.response_message}</p>
                                                                            {c.responded_at && (
                                                                                <p className="text-[10px] text-slate-500">
                                                                                    {t('risks:questionnaire.clarification_responded_by')}{' '}
                                                                                    {c.responded_by_user_name ?? t('common:fallbacks.unknown_user')} •{' '}
                                                                                    {new Date(c.responded_at).toLocaleString()}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    ) : isRiskOwner ? (
                                                                        <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                                                                            {respondingClarificationId !== c.id ? (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setRespondingClarificationId(c.id);
                                                                                        setResponseMessage('');
                                                                                    }}
                                                                                    className="text-xs text-accent hover:text-accent/80 font-bold"
                                                                                >
                                                                                    {t('risks:questionnaire.respond')}
                                                                                </button>
                                                                            ) : (
                                                                                <>
                                                                                    <textarea
                                                                                        value={responseMessage}
                                                                                        onChange={(e) => setResponseMessage(e.target.value)}
                                                                                        rows={3}
                                                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                                                                        placeholder={t('risks:questionnaire.clarification_response_placeholder')}
                                                                                    />
                                                                                    <div className="flex items-center justify-end gap-2">
                                                                                        <button
                                                                                            onClick={() => setRespondingClarificationId(null)}
                                                                                            className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                                                                        >
                                                                                            {t('common:actions.cancel')}
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleRespondClarification(c.id)}
                                                                                            disabled={responseMessage.trim() === ''}
                                                                                            className={cn(
                                                                                                "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                                                                                                "bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50",
                                                                                                responseMessage.trim() === '' && "opacity-50 cursor-not-allowed"
                                                                                            )}
                                                                                        >
                                                                                            {t('common:actions.submit')}
                                                                                        </button>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {section.questions.map(q => {
                                                        const label = t(`risks:questionnaire.questions.${q.key}`, q.key);
                                                        const value = answers[q.key];
                                                        const required = q.required;
                                                        const missing = missingKeys.includes(q.key);
                                                        const spanFullWidth = q.type === 'textarea';
                                                        const changed = isChanged(q.key);
                                                        const helperText = q.helperTextKey ? t(`risks:${q.helperTextKey}`, '') : '';

                                                        if (!isEditable) {
                                                            return (
                                                                <div
                                                                    key={q.key}
                                                                    className={cn("space-y-1", spanFullWidth && "md:col-span-2")}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-xs font-bold text-slate-300">
                                                                            {label}
                                                                        </p>
                                                                        {changed && (
                                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                                                                                {t('risks:questionnaire.changed')}
                                                                            </span>
                                                                        )}
                                                                        {required && (
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                                                {t('risks:questionnaire.required')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white">
                                                                        {renderAnswer(q.key, value)}
                                                                    </div>
                                                                    {changed && (
                                                                        <div className="text-xs text-slate-500">
                                                                            {t('risks:questionnaire.previous')}: {renderAnswer(q.key, getPreviousAnswer(q.key))}
                                                                        </div>
                                                                    )}
                                                                    {helperText && (
                                                                        <div className="text-xs text-slate-500">{helperText}</div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div
                                                                key={q.key}
                                                                className={cn("space-y-1", spanFullWidth && "md:col-span-2")}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <p className={cn("text-xs font-bold", missing ? "text-rose-400" : "text-slate-300")}>
                                                                        {label}
                                                                    </p>
                                                                    {changed && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                                                                            {t('risks:questionnaire.changed')}
                                                                        </span>
                                                                    )}
                                                                    {required && (
                                                                        <span className={cn("text-[10px] font-black uppercase tracking-widest", missing ? "text-rose-400" : "text-slate-500")}>
                                                                            {t('risks:questionnaire.required')}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {helperText && (
                                                                    <div className="text-xs text-slate-500">{helperText}</div>
                                                                )}

                                                                {(q.key === LIKELIHOOD_12M_KEY || q.key === WORST_CASE_IMPACT_KEY) && (
                                                                    <ThemedSelect
                                                                        value={typeof value === 'number' ? String(value) : ''}
                                                                        onValueChange={(v) => {
                                                                            setAnswers(prev => ({
                                                                                ...prev,
                                                                                [q.key]: v === '' ? undefined : Number.parseInt(v, 10),
                                                                            }));
                                                                        }}
                                                                        placeholder={t('common:actions.select')}
                                                                        allowEmpty
                                                                        emptyLabel={t('common:labels.none')}
                                                                        className={cn(
                                                                            missing && "border-rose-500/40 focus:border-rose-500/60 focus:ring-rose-500/30"
                                                                        )}
                                                                        options={q.key === LIKELIHOOD_12M_KEY ? likelihoodOptions : worstCaseImpactOptions}
                                                                    />
                                                                )}

                                                                {q.type === 'boolean' && (
                                                                    <ThemedSelect
                                                                        value={typeof value === 'boolean' ? String(value) : ''}
                                                                        onValueChange={(v) => setAnswers(prev => ({ ...prev, [q.key]: v === 'true' }))}
                                                                        placeholder={t('common:actions.select')}
                                                                        allowEmpty
                                                                        emptyLabel={t('common:labels.none')}
                                                                        options={[
                                                                            { value: 'true', label: t('common:actions.yes') },
                                                                            { value: 'false', label: t('common:actions.no') },
                                                                        ]}
                                                                    />
                                                                )}

                                                                {q.type === 'single_select' && (
                                                                    <ThemedSelect
                                                                        value={typeof value === 'string' ? value : ''}
                                                                        onValueChange={(v) => setAnswers(prev => ({ ...prev, [q.key]: v }))}
                                                                        placeholder={t('common:actions.select')}
                                                                        allowEmpty
                                                                        emptyLabel={t('common:labels.none')}
                                                                        options={(q.options ?? []).map(opt => ({
                                                                            value: opt,
                                                                            label: t(`risks:questionnaire.questions.${opt}`, opt),
                                                                        }))}
                                                                    />
                                                                )}

                                                                {q.type === 'text' && (
                                                                    <input
                                                                        value={typeof value === 'string' ? value : ''}
                                                                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                                                                        className={cn(
                                                                            "w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all",
                                                                            missing ? "border-rose-500/40 focus:border-rose-500/60" : "border-white/10 focus:border-accent/50"
                                                                        )}
                                                                    />
                                                                )}

                                                                {q.type === 'number' && q.key !== LIKELIHOOD_12M_KEY && q.key !== WORST_CASE_IMPACT_KEY && (
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        max={5}
                                                                        step={1}
                                                                        value={typeof value === 'number' ? String(value) : ''}
                                                                        onChange={(e) => {
                                                                            const raw = e.target.value;
                                                                            setAnswers(prev => ({
                                                                                ...prev,
                                                                                [q.key]: raw === '' ? undefined : Number.parseInt(raw, 10),
                                                                            }));
                                                                        }}
                                                                        className={cn(
                                                                            "w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all",
                                                                            missing ? "border-rose-500/40 focus:border-rose-500/60" : "border-white/10 focus:border-accent/50"
                                                                        )}
                                                                    />
                                                                )}

                                                                {q.type === 'textarea' && (
                                                                    <textarea
                                                                        value={typeof value === 'string' ? value : ''}
                                                                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                                                                        rows={3}
                                                                        className={cn(
                                                                            "w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white outline-none transition-all resize-none",
                                                                            missing ? "border-rose-500/40 focus:border-rose-500/60" : "border-white/10 focus:border-accent/50"
                                                                        )}
                                                                    />
                                                                )}

                                                                {changed && (
                                                                    <div className="text-xs text-slate-500">
                                                                        {t('risks:questionnaire.previous')}: {renderAnswer(q.key, getPreviousAnswer(q.key))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
                                <div className="text-xs text-slate-500">
                                    {!canSubmit && (
                                        <span>{t('risks:questionnaire.readonly_hint')}</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {isEditable && (
                                        <>
                                            <button
                                                onClick={handleSave}
                                                disabled={saving || submitting}
                                                className={cn(
                                                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                                                    "bg-white/5 border-white/10 text-white hover:bg-white/10",
                                                    (saving || submitting) && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <Save className="h-4 w-4" />
                                                {t('risks:questionnaire.actions.save')}
                                            </button>
                                            <button
                                                onClick={handleSubmit}
                                                disabled={saving || submitting}
                                                className={cn(
                                                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                                                    "bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50",
                                                    (saving || submitting) && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <Send className="h-4 w-4" />
                                                {t('common:actions.submit')}
                                            </button>
                                        </>
                                    )}

                                    <button
                                        onClick={close}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                    >
                                        {t('common:actions.close')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
    );
        </AnimatePresence>
    );

    return createPortal(portalContent, document.body);
}
