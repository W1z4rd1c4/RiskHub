import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CheckCircle2, ClipboardList, Loader2, Plus, Save, Send, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import type { Vendor } from '@/types/vendor';
import type { VendorAssessment, VendorAssessmentStatus, VendorCommitteeRecommendation } from '@/types/vendorAssessment';
import { vendorAssessmentApi } from '@/services/vendorAssessmentApi';
import { getVendorAssessmentTemplate, type VendorAssessmentSection } from './vendorAssessmentQuestions';
import { useAuth } from '@/contexts/AuthContext';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface VendorAssessmentsTabProps {
    vendor: Vendor;
    canEdit: boolean; // owner or vendors:write
}

function statusPill(status: VendorAssessmentStatus) {
    const base = 'px-2 py-1 rounded-full text-[10px] font-black border';
    switch (status) {
        case 'draft':
            return <span className={`${base} text-slate-300 bg-white/5 border-white/10`}>DRAFT</span>;
        case 'submitted':
            return <span className={`${base} text-blue-300 bg-blue-400/10 border-blue-400/20`}>SUBMITTED</span>;
        case 'in_review':
            return <span className={`${base} text-amber-300 bg-amber-400/10 border-amber-400/20`}>IN REVIEW</span>;
        case 'committee_recommended':
            return <span className={`${base} text-violet-300 bg-violet-400/10 border-violet-400/20`}>RECOMMENDED</span>;
        case 'approved':
            return <span className={`${base} text-emerald-300 bg-emerald-400/10 border-emerald-400/20`}>APPROVED</span>;
        case 'rejected':
            return <span className={`${base} text-rose-300 bg-rose-400/10 border-rose-400/20`}>REJECTED</span>;
        default:
            return <span className={`${base} text-slate-300 bg-white/5 border-white/10`}>{status}</span>;
    }
}

function renderInput(
    section: VendorAssessmentSection,
    key: string,
    value: unknown,
    onChange: (v: unknown) => void,
    disabled: boolean,
) {
    const q = section.questions.find((qq) => qq.key === key);
    if (!q) return null;

    const common =
        'w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60';

    if (q.type === 'boolean') {
        const checked = Boolean(value);
        return (
            <label className="flex items-center gap-3 text-sm text-slate-200 font-medium">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-white/20 bg-white/5"
                />
                {q.label}
            </label>
        );
    }

    if (q.type === 'single_select') {
        const v = typeof value === 'string' ? value : '';
        return (
            <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{q.label}</p>
                <ThemedSelect
                    value={v}
                    onValueChange={(vv) => onChange(vv)}
                    options={(q.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
                    placeholder="Select"
                    disabled={disabled}
                />
            </div>
        );
    }

    if (q.type === 'textarea') {
        return (
            <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{q.label}</p>
                <textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                    rows={3}
                    placeholder={q.placeholder}
                    disabled={disabled}
                    className={common}
                />
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{q.label}</p>
            <input
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={q.placeholder}
                disabled={disabled}
                className={common}
            />
        </div>
    );
}

export function VendorAssessmentsTab({ vendor, canEdit }: VendorAssessmentsTabProps) {
    const { t } = useTranslation('vendors');
    const { user } = useAuth();

    const [items, setItems] = useState<VendorAssessment[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selected, setSelected] = useState<VendorAssessment | null>(null);
    const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});
    const [draftEvidence, setDraftEvidence] = useState<string>('');
    const [committeeRecommendation, setCommitteeRecommendation] = useState<VendorCommitteeRecommendation>('approve');
    const [committeeConditions, setCommitteeConditions] = useState<string>('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isSecondLine = user?.role === 'risk_manager' || user?.role === 'compliance';
    const isCRO = user?.role === 'cro';

    const template = useMemo(() => {
        if (!selected) return [];
        return getVendorAssessmentTemplate(selected.scope, selected.template_version);
    }, [selected]);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorAssessmentApi.getVendorAssessments(vendor.id);
            setItems(data);
            setError(null);
            if (data.length && !selectedId) setSelectedId(data[0].id);
        } catch (err) {
            console.error('Failed to load vendor assessments:', err);
            setError(t('errors.load_failed', 'Failed to load'));
        } finally {
            setIsLoading(false);
        }
    }, [selectedId, t, vendor.id]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (!selectedId) {
            setSelected(null);
            return;
        }
        const found = items.find((i) => i.id === selectedId) ?? null;
        setSelected(found);
        const answers = (found?.answers_json ?? {}) as Record<string, unknown>;
        setDraftAnswers(answers);
        setDraftEvidence(found?.evidence_reference ?? '');
        setCommitteeRecommendation((found?.committee_recommendation ?? 'approve') as VendorCommitteeRecommendation);
        setCommitteeConditions(found?.conditions_text ?? '');
    }, [items, selectedId]);

    const canEditDraft = canEdit && selected?.status === 'draft';

    const createDraft = async () => {
        try {
            setIsSaving(true);
            const created = await vendorAssessmentApi.createVendorAssessment(vendor.id);
            await refresh();
            setSelectedId(created.id);
        } catch (err) {
            console.error('Failed to create assessment:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const saveDraft = async () => {
        if (!selected) return;
        try {
            setIsSaving(true);
            await vendorAssessmentApi.updateDraft(selected.id, {
                answers_json: draftAnswers,
                evidence_reference: draftEvidence || null,
            });
            await refresh();
        } catch (err) {
            console.error('Failed to save assessment draft:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const submit = async () => {
        if (!selected) return;
        try {
            setIsSaving(true);
            await vendorAssessmentApi.submit(selected.id);
            await refresh();
        } catch (err) {
            console.error('Failed to submit assessment:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const review = async () => {
        if (!selected) return;
        try {
            setIsSaving(true);
            await vendorAssessmentApi.review(selected.id);
            await refresh();
        } catch (err) {
            console.error('Failed to review assessment:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const recommend = async () => {
        if (!selected) return;
        try {
            setIsSaving(true);
            await vendorAssessmentApi.committeeRecommend(selected.id, {
                committee_recommendation: committeeRecommendation,
                conditions_text: committeeConditions || null,
            });
            await refresh();
        } catch (err) {
            console.error('Failed to recommend:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const decide = async (decision: 'approved' | 'rejected') => {
        if (!selected) return;
        try {
            setIsSaving(true);
            await vendorAssessmentApi.decide(selected.id, { decision });
            await refresh();
        } catch (err) {
            console.error('Failed to decide:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        {t('tabs.assessments', 'Assessments')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('assessments.subtitle', 'Due diligence workflow: draft → review → recommendation → decision.')}
                    </p>
                </div>

                {canEdit && (
                    <button
                        onClick={createDraft}
                        disabled={isSaving}
                        className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {t('assessments.actions.start', 'Start assessment')}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading', 'Loading...')}
                </div>
            ) : error ? (
                <div className="text-rose-400 font-medium">{error}</div>
            ) : items.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                    <ClipboardList className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 font-medium tracking-tight">{t('assessments.empty', 'No assessments yet.')}</p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-1 space-y-2">
                        {items.map((a) => (
                            <button
                                key={a.id}
                                onClick={() => setSelectedId(a.id)}
                                className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedId === a.id
                                    ? 'bg-white/[0.04] border-accent/30'
                                    : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.04]'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm text-white font-bold">
                                            {t('assessments.item_title', { defaultValue: 'Assessment' })} #{a.id}
                                        </p>
                                        <p className="text-xs text-slate-500 font-medium">
                                            {a.scope === 'dora' ? 'DORA' : 'Standard'} · {new Date(a.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {statusPill(a.status)}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        {selected && (
                            <>
                                <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {statusPill(selected.status)}
                                            <span className="text-xs text-slate-500 font-medium">
                                                {selected.scope === 'dora' ? 'DORA scope' : 'Standard scope'}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {canEditDraft && (
                                                <>
                                                    <button
                                                        onClick={saveDraft}
                                                        disabled={isSaving}
                                                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-60"
                                                    >
                                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                        {t('assessments.actions.save', 'Save')}
                                                    </button>
                                                    <button
                                                        onClick={submit}
                                                        disabled={isSaving}
                                                        className="px-4 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors flex items-center gap-2 disabled:opacity-60"
                                                    >
                                                        <Send className="h-4 w-4" />
                                                        {t('assessments.actions.submit', 'Submit')}
                                                    </button>
                                                </>
                                            )}

                                            {selected.status === 'submitted' && isSecondLine && (
                                                <button
                                                    onClick={review}
                                                    disabled={isSaving}
                                                    className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 text-amber-200 rounded-xl font-bold hover:bg-amber-500/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                                                >
                                                    <UserCheck className="h-4 w-4" />
                                                    {t('assessments.actions.review', 'Review')}
                                                </button>
                                            )}

                                            {selected.status === 'in_review' && isSecondLine && (
                                                <button
                                                    onClick={recommend}
                                                    disabled={isSaving}
                                                    className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 text-violet-200 rounded-xl font-bold hover:bg-violet-500/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                    {t('assessments.actions.recommend', 'Recommend')}
                                                </button>
                                            )}

                                            {selected.status === 'committee_recommended' && isCRO && (
                                                <>
                                                    <button
                                                        onClick={() => decide('approved')}
                                                        disabled={isSaving}
                                                        className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 rounded-xl font-bold hover:bg-emerald-500/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                        {t('assessments.actions.approve', 'Approve')}
                                                    </button>
                                                    <button
                                                        onClick={() => decide('rejected')}
                                                        disabled={isSaving}
                                                        className="px-4 py-2 bg-rose-500/20 border border-rose-500/30 text-rose-200 rounded-xl font-bold hover:bg-rose-500/30 transition-colors flex items-center gap-2 disabled:opacity-60"
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                        {t('assessments.actions.reject', 'Reject')}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {t('assessments.fields.evidence', 'Evidence reference')}
                                        </p>
                                        <input
                                            value={draftEvidence}
                                            onChange={(e) => setDraftEvidence(e.target.value)}
                                            disabled={!canEditDraft}
                                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium disabled:opacity-60"
                                            placeholder="https://... or file path"
                                        />
                                    </div>

                                    {selected.status === 'in_review' && isSecondLine && (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    {t('assessments.fields.committee_recommendation', 'Committee recommendation')}
                                                </p>
                                                <ThemedSelect
                                                    value={committeeRecommendation}
                                                    onValueChange={(v) => setCommitteeRecommendation(v as VendorCommitteeRecommendation)}
                                                    options={[
                                                        { value: 'approve', label: 'Approve' },
                                                        { value: 'approve_with_conditions', label: 'Approve with conditions' },
                                                        { value: 'reject', label: 'Reject' },
                                                    ]}
                                                    placeholder="Select"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    {t('assessments.fields.conditions', 'Conditions')}
                                                </p>
                                                <input
                                                    value={committeeConditions}
                                                    onChange={(e) => setCommitteeConditions(e.target.value)}
                                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium"
                                                    placeholder="Optional"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {template.map((section) => (
                                        <div key={section.key} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                                                {section.title}
                                            </h4>
                                            <div className="grid gap-3">
                                                {section.questions.map((q) => (
                                                    <div key={q.key}>
                                                        {renderInput(
                                                            section,
                                                            q.key,
                                                            draftAnswers[q.key],
                                                            (v) => setDraftAnswers((prev) => ({ ...prev, [q.key]: v })),
                                                            !canEditDraft,
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
