import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, Plus, Save, Send, ShieldCheck, UserCheck, XCircle } from 'lucide-react';

import { useAuthz } from '@/authz/useAuthz';
import {
    VendorActionButton,
    VendorBadge,
    VendorEmptyState,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { vendorAssessmentApi } from '@/services/vendorAssessmentApi';
import type { Vendor } from '@/types/vendor';
import type {
    VendorAssessment,
    VendorAssessmentStatus,
    VendorCommitteeRecommendation,
} from '@/types/vendorAssessment';

import { getVendorAssessmentTemplate, type VendorAssessmentSection } from './vendorAssessmentQuestions';

interface VendorAssessmentsTabProps {
    vendor: Vendor;
    canEdit: boolean;
}

function statusBadge(status: VendorAssessmentStatus, t: (key: string, fallback?: string) => string) {
    switch (status) {
        case 'draft':
            return <VendorBadge tone="neutral">{t('assessments.status.draft')}</VendorBadge>;
        case 'submitted':
            return <VendorBadge tone="info">{t('assessments.status.submitted')}</VendorBadge>;
        case 'in_review':
            return <VendorBadge tone="warn">{t('assessments.status.in_review')}</VendorBadge>;
        case 'committee_recommended':
            return <VendorBadge tone="info">{t('assessments.status.committee_recommended')}</VendorBadge>;
        case 'approved':
            return <VendorBadge tone="success">{t('assessments.status.approved')}</VendorBadge>;
        case 'rejected':
            return <VendorBadge tone="danger">{t('assessments.status.rejected')}</VendorBadge>;
        default:
            return <VendorBadge tone="neutral">{status}</VendorBadge>;
    }
}

function renderInput(
    section: VendorAssessmentSection,
    key: string,
    value: unknown,
    onChange: (v: unknown) => void,
    disabled: boolean,
    t: (key: string, fallback?: string) => string,
) {
    const question = section.questions.find((candidate) => candidate.key === key);
    if (!question) return null;

    if (question.type === 'boolean') {
        return (
            <label className="vendor-checkbox">
                <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => onChange(event.target.checked)}
                    disabled={disabled}
                />
                <span>{t(question.labelKey, question.labelKey)}</span>
            </label>
        );
    }

    if (question.type === 'single_select') {
        return (
            <div className="vendor-field">
                <label className="vendor-label">{t(question.labelKey, question.labelKey)}</label>
                <ThemedSelect
                    value={typeof value === 'string' ? value : ''}
                    onValueChange={(nextValue) => onChange(nextValue)}
                    options={(question.options ?? []).map((option) => ({
                        value: option.value,
                        label: t(option.labelKey, option.labelKey),
                    }))}
                    placeholder={t('common:actions.select')}
                    disabled={disabled}
                />
            </div>
        );
    }

    if (question.type === 'textarea') {
        return (
            <div className="vendor-field">
                <label className="vendor-label">{t(question.labelKey, question.labelKey)}</label>
                <textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onChange(event.target.value)}
                    rows={3}
                    placeholder={question.placeholderKey ? t(question.placeholderKey, question.placeholderKey) : undefined}
                    disabled={disabled}
                    className="vendor-textarea"
                />
            </div>
        );
    }

    return (
        <div className="vendor-field">
            <label className="vendor-label">{t(question.labelKey, question.labelKey)}</label>
            <input
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => onChange(event.target.value)}
                placeholder={question.placeholderKey ? t(question.placeholderKey, question.placeholderKey) : undefined}
                disabled={disabled}
                className="vendor-input"
            />
        </div>
    );
}

export function VendorAssessmentsTab({ vendor, canEdit }: VendorAssessmentsTabProps) {
    const { t } = useTranslation('vendors');
    const authz = useAuthz();

    const [items, setItems] = useState<VendorAssessment[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selected, setSelected] = useState<VendorAssessment | null>(null);
    const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});
    const [draftEvidence, setDraftEvidence] = useState('');
    const [committeeRecommendation, setCommitteeRecommendation] = useState<VendorCommitteeRecommendation>('approve');
    const [committeeConditions, setCommitteeConditions] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isSecondLine = authz.isSecondLine;
    const isCRO = authz.isCRO;

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
            if (data.length && !selectedId) {
                setSelectedId(data[0].id);
            }
        } catch (err) {
            console.error('Failed to load vendor assessments:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [selectedId, t, vendor.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!selectedId) {
            setSelected(null);
            return;
        }

        const found = items.find((item) => item.id === selectedId) ?? null;
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
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<ClipboardList className="h-4 w-4" />}
                title={t('tabs.assessments')}
                description={t('assessments.subtitle')}
                actions={canEdit ? (
                    <VendorActionButton onClick={createDraft} disabled={isSaving} variant="primary">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {t('assessments.actions.start')}
                    </VendorActionButton>
                ) : null}
            />

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <VendorInlineMessage tone="danger">{error}</VendorInlineMessage>
            ) : items.length === 0 ? (
                <VendorEmptyState
                    icon={<ClipboardList className="h-8 w-8" />}
                    title={t('assessments.empty')}
                    description={t('assessments.subtitle')}
                />
            ) : (
                <div className="vendor-split-layout">
                    <div className="vendor-stack">
                        {items.map((assessment) => (
                            <button
                                key={assessment.id}
                                type="button"
                                onClick={() => setSelectedId(assessment.id)}
                                className={cn(
                                    'vendor-card vendor-card--interactive w-full text-left',
                                    selectedId === assessment.id && 'vendor-card--active',
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="vendor-card__title">
                                            {t('assessments.item_title', { defaultValue: 'Assessment' })} #{assessment.id}
                                        </p>
                                        <p className="vendor-card__meta">
                                            {assessment.scope === 'dora'
                                                ? t('assessments.scope.dora')
                                                : t('assessments.scope.standard')}{' '}
                                            · {new Date(assessment.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {statusBadge(assessment.status, t)}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="vendor-stack vendor-stack--lg">
                        {selected ? (
                            <>
                                <div className="vendor-card space-y-4">
                                    {/* Workflow Stepper */}
                                    {(() => {
                                        const steps: { key: VendorAssessmentStatus; label: string }[] = [
                                            { key: 'draft', label: t('assessments.status.draft') },
                                            { key: 'submitted', label: t('assessments.status.submitted') },
                                            { key: 'in_review', label: t('assessments.status.in_review') },
                                            { key: 'committee_recommended', label: t('assessments.status.committee_recommended') },
                                        ];
                                        const finalStep = selected.status === 'rejected'
                                            ? { key: 'rejected' as VendorAssessmentStatus, label: t('assessments.status.rejected') }
                                            : { key: 'approved' as VendorAssessmentStatus, label: t('assessments.status.approved') };
                                        steps.push(finalStep);

                                        const order: VendorAssessmentStatus[] = steps.map((s) => s.key);
                                        const currentIdx = order.indexOf(selected.status);

                                        return (
                                            <div className="vendor-stepper">
                                                {steps.map((step, idx) => {
                                                    const isDone = idx < currentIdx;
                                                    const isActive = idx === currentIdx;
                                                    const cls = isDone ? 'vendor-stepper__step--done' : isActive ? 'vendor-stepper__step--active' : '';
                                                    return (
                                                        <div key={step.key} style={{ display: 'contents' }}>
                                                            {idx > 0 && <div className="vendor-stepper__connector" />}
                                                            <div className={`vendor-stepper__step ${cls}`}>
                                                                <div className="vendor-stepper__dot">{isDone ? '✓' : idx + 1}</div>
                                                                <span className="vendor-stepper__label">{step.label}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    <div className="vendor-divider" />

                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="vendor-toolbar">
                                            {statusBadge(selected.status, t)}
                                            <span className="vendor-card__meta">
                                                {selected.scope === 'dora'
                                                    ? t('assessments.scope.dora_scope')
                                                    : t('assessments.scope.standard_scope')}
                                            </span>
                                        </div>

                                        <div className="vendor-toolbar">
                                            {canEditDraft ? (
                                                <>
                                                    <VendorActionButton onClick={saveDraft} disabled={isSaving}>
                                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                        {t('assessments.actions.save')}
                                                    </VendorActionButton>
                                                    <VendorActionButton onClick={submit} disabled={isSaving} variant="primary">
                                                        <Send className="h-4 w-4" />
                                                        {t('assessments.actions.submit')}
                                                    </VendorActionButton>
                                                </>
                                            ) : null}

                                            {selected.status === 'submitted' && isSecondLine ? (
                                                <VendorActionButton onClick={review} disabled={isSaving}>
                                                    <UserCheck className="h-4 w-4" />
                                                    {t('assessments.actions.review')}
                                                </VendorActionButton>
                                            ) : null}

                                            {selected.status === 'in_review' && isSecondLine ? (
                                                <VendorActionButton onClick={recommend} disabled={isSaving}>
                                                    <ShieldCheck className="h-4 w-4" />
                                                    {t('assessments.actions.recommend')}
                                                </VendorActionButton>
                                            ) : null}

                                            {selected.status === 'committee_recommended' && isCRO ? (
                                                <>
                                                    <VendorActionButton onClick={() => decide('approved')} disabled={isSaving} variant="success">
                                                        <CheckCircle2 className="h-4 w-4" />
                                                        {t('assessments.actions.approve')}
                                                    </VendorActionButton>
                                                    <VendorActionButton onClick={() => decide('rejected')} disabled={isSaving} variant="danger">
                                                        <XCircle className="h-4 w-4" />
                                                        {t('assessments.actions.reject')}
                                                    </VendorActionButton>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="vendor-field">
                                        <label className="vendor-label">{t('assessments.fields.evidence')}</label>
                                        <input
                                            value={draftEvidence}
                                            onChange={(event) => setDraftEvidence(event.target.value)}
                                            disabled={!canEditDraft}
                                            className="vendor-input"
                                            placeholder={t('assessments.fields.evidence_placeholder')}
                                        />
                                    </div>

                                    {selected.status === 'in_review' && isSecondLine ? (
                                        <div className="vendor-field-grid">
                                            <div className="vendor-field">
                                                <label className="vendor-label">{t('assessments.fields.committee_recommendation')}</label>
                                                <ThemedSelect
                                                    value={committeeRecommendation}
                                                    onValueChange={(value) =>
                                                        setCommitteeRecommendation(value as VendorCommitteeRecommendation)
                                                    }
                                                    options={[
                                                        { value: 'approve', label: t('assessments.actions.approve') },
                                                        {
                                                            value: 'approve_with_conditions',
                                                            label: t('assessments.actions.approve_with_conditions'),
                                                        },
                                                        { value: 'reject', label: t('assessments.actions.reject') },
                                                    ]}
                                                    placeholder={t('common:actions.select')}
                                                />
                                            </div>
                                            <div className="vendor-field">
                                                <label className="vendor-label">{t('assessments.fields.conditions')}</label>
                                                <input
                                                    value={committeeConditions}
                                                    onChange={(event) => setCommitteeConditions(event.target.value)}
                                                    className="vendor-input"
                                                    placeholder={t('assessments.fields.optional')}
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="vendor-stack">
                                    {template.map((section) => (
                                        <div key={section.key} className="vendor-card space-y-4">
                                            <div>
                                                <h3 className="vendor-section-title">{t(section.titleKey, section.titleKey)}</h3>
                                            </div>
                                            <div className="vendor-stack">
                                                {section.questions.map((question) => (
                                                    <div key={question.key}>
                                                        {renderInput(
                                                            section,
                                                            question.key,
                                                            draftAnswers[question.key],
                                                            (nextValue) =>
                                                                setDraftAnswers((previous) => ({
                                                                    ...previous,
                                                                    [question.key]: nextValue,
                                                                })),
                                                            !canEditDraft,
                                                            t,
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <VendorEmptyState
                                icon={<ClipboardList className="h-8 w-8" />}
                                title={t('assessments.empty')}
                                description={t('assessments.subtitle')}
                            />
                        )}
                    </div>
                </div>
            )}
        </VendorSurface>
    );
}
