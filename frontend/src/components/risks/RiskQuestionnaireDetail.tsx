import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Calendar, Clock, FileText, Save, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireDetail } from '@/types/riskQuestionnaire';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { useAuth } from '@/contexts/AuthContext';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';
import { RISK_OWNER_REASSESSMENT_V1 } from './riskQuestionnaireQuestions';

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

export function RiskQuestionnaireDetail({
    isOpen,
    onClose,
    questionnaireId,
    risk,
    onChanged,
}: RiskQuestionnaireDetailProps) {
    const { t } = useTranslation(['common', 'risks']);
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [questionnaire, setQuestionnaire] = useState<RiskQuestionnaireDetail | null>(null);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [missingKeys, setMissingKeys] = useState<string[]>([]);

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
        return user.role === 'department_head' && user.department_id === risk.department_id;
    }, [risk.department_id, risk.owner_id, user]);

    const isEditable = canSubmit && questionnaire?.status !== 'submitted';

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!isOpen || !questionnaireId) return;
            setError(null);
            setMissingKeys([]);
            setLoading(true);
            try {
                const data = await riskQuestionnairesApi.get(questionnaireId);
                if (cancelled) return;
                setQuestionnaire(data);
                const nextAnswers = (data.answers ?? {}) as Record<string, unknown>;
                setAnswers(nextAnswers);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : t('errors.generic'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [isOpen, questionnaireId, t]);

    const validate = () => {
        const required = RISK_OWNER_REASSESSMENT_V1.flatMap(s => s.questions).filter(q => q.required);
        const missing = required
            .filter(q => isMissingAnswer(answers[q.key]))
            .map(q => q.key);
        setMissingKeys(missing);
        return missing.length === 0;
    };

    const handleSave = async () => {
        if (!questionnaire) return;
        setSaving(true);
        setError(null);
        try {
            const updated = await riskQuestionnairesApi.saveDraft(questionnaire.id, answers);
            setQuestionnaire(updated);
            onChanged?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : t('errors.generic'));
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!questionnaire) return;
        setError(null);
        if (!validate()) {
            setError(t('risks:questionnaire.validation_missing', 'Please answer all required questions.'));
            return;
        }
        setSubmitting(true);
        try {
            const updated = await riskQuestionnairesApi.submit(questionnaire.id, answers);
            setQuestionnaire(updated);
            onChanged?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : t('errors.generic'));
        } finally {
            setSubmitting(false);
        }
    };

    const renderAnswer = (key: string, value: unknown) => {
        if (value === undefined || value === null) return t('labels.unknown', 'Unknown');
        if (typeof value === 'boolean') return value ? t('actions.yes') : t('actions.no');
        if (typeof value === 'string') {
            // Handle select option translation keys
            if (value.startsWith('risk_assessment.options.')) {
                return t(`risks:questionnaire.questions.${value}`, value);
            }
            return value;
        }
        return String(value);
    };

    const close = () => {
        setError(null);
        setMissingKeys([]);
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
                                        {t('risks:questionnaire.title', 'Risk Assessment Questionnaire')}
                                    </h3>
                                    {questionnaire && (
                                        <div className="mt-2 text-xs text-slate-500 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-3.5 w-3.5" />
                                                <span>{t('risks:questionnaire.meta.sent', 'Sent')}:</span>
                                                <span className="text-slate-300">{new Date(questionnaire.sent_at).toLocaleString()}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <Calendar className="h-3.5 w-3.5" />
                                                <span>{t('risks:questionnaire.meta.due', 'Due')}:</span>
                                                <span className={cn("text-slate-300", isOverdue && "text-rose-400 font-bold")}>
                                                    {new Date(questionnaire.due_at).toLocaleDateString()}
                                                </span>
                                                {isOverdue && (
                                                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400">
                                                        {t('risks:questionnaire.status.overdue', 'Overdue')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span>{t('risks:questionnaire.meta.status', 'Status')}:</span>
                                                <span className="text-slate-300">{questionnaire.status}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <span>{t('risks:questionnaire.meta.assignee', 'Assignee')}:</span>
                                                <span className="text-slate-300">{questionnaire.assigned_to_user_name ?? questionnaire.assigned_to_user_id}</span>
                                                <span className="mx-2 opacity-30">•</span>
                                                <span>{t('risks:questionnaire.meta.sender', 'Sender')}:</span>
                                                <span className="text-slate-300">{questionnaire.sent_by_user_name ?? questionnaire.sent_by_user_id}</span>
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
                                ) : error ? (
                                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-2">
                                        <AlertCircle className="h-4 w-4 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-medium">{error}</p>
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
                                        {RISK_OWNER_REASSESSMENT_V1.map(section => (
                                            <section key={section.titleKey} className="space-y-3">
                                                <h4 className="text-xs font-black text-white uppercase tracking-widest">
                                                    {t(`risks:${section.titleKey}`, section.titleKey)}
                                                </h4>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {section.questions.map(q => {
                                                        const label = t(`risks:questionnaire.questions.${q.key}`, q.key);
                                                        const value = answers[q.key];
                                                        const required = q.required;
                                                        const missing = missingKeys.includes(q.key);
                                                        const spanFullWidth = q.type === 'textarea';

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
                                                                        {required && (
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                                                {t('risks:questionnaire.required', 'Required')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white">
                                                                        {renderAnswer(q.key, value)}
                                                                    </div>
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
                                                                    {required && (
                                                                        <span className={cn("text-[10px] font-black uppercase tracking-widest", missing ? "text-rose-400" : "text-slate-500")}>
                                                                            {t('risks:questionnaire.required', 'Required')}
                                                                        </span>
                                                                    )}
                                                                </div>

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

                                                                {q.type === 'number' && (
                                                                    <input
                                                                        type="number"
                                                                        value={typeof value === 'number' ? String(value) : ''}
                                                                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.key]: Number(e.target.value) }))}
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
                                        <span>{t('risks:questionnaire.readonly_hint', 'Read-only: you are not assigned to submit this questionnaire.')}</span>
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
                                                {t('risks:questionnaire.actions.save', 'Save progress')}
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
