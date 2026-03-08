import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ShieldAlert, ShieldCheck } from 'lucide-react';

import {
    VendorActionButton,
    VendorBadge,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { useTranslation } from '@/i18n/hooks';
import { vendorResilienceApi } from '@/services/vendorResilienceApi';
import type { VendorPlanStatus, VendorResilience } from '@/types/vendorResilience';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface VendorResilienceTabProps {
    vendorId: number;
    canEdit: boolean;
}

function toDateInput(dateTime?: string | null): string {
    if (!dateTime) return '';
    try {
        return new Date(dateTime).toISOString().slice(0, 10);
    } catch {
        return '';
    }
}

function fromDateInput(value: string): string | null {
    if (!value) return null;
    return `${value}T00:00:00Z`;
}

function planStatusTone(status: VendorPlanStatus) {
    switch (status) {
        case 'complete':
            return 'success' as const;
        case 'in_progress':
            return 'warn' as const;
        default:
            return 'neutral' as const;
    }
}

export function VendorResilienceTab({ vendorId, canEdit }: VendorResilienceTabProps) {
    const { t } = useTranslation('vendors');
    const [data, setData] = useState<VendorResilience | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [exitStatus, setExitStatus] = useState<VendorPlanStatus>('not_started');
    const [exitRef, setExitRef] = useState('');
    const [exitNotes, setExitNotes] = useState('');
    const [exitReviewed, setExitReviewed] = useState('');
    const [exitTested, setExitTested] = useState('');

    const [contStatus, setContStatus] = useState<VendorPlanStatus>('not_started');
    const [contRef, setContRef] = useState('');
    const [contNotes, setContNotes] = useState('');
    const [contReviewed, setContReviewed] = useState('');
    const [contTested, setContTested] = useState('');
    const [outageHours, setOutageHours] = useState('');
    const [ciaC, setCiaC] = useState(false);
    const [ciaI, setCiaI] = useState(false);
    const [ciaA, setCiaA] = useState(false);
    const [ciaAv, setCiaAv] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const resilience = await vendorResilienceApi.getResilience(vendorId);
            setData(resilience);
            setError(null);
        } catch (err) {
            console.error('Failed to load vendor resilience:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendorId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!data) return;

        setExitStatus(data.exit_plan?.status ?? 'not_started');
        setExitRef(data.exit_plan?.plan_reference ?? '');
        setExitNotes(data.exit_plan?.notes ?? '');
        setExitReviewed(toDateInput(data.exit_plan?.last_reviewed_at ?? null));
        setExitTested(toDateInput(data.exit_plan?.last_tested_at ?? null));

        setContStatus(data.contingency_plan?.status ?? 'not_started');
        setContRef(data.contingency_plan?.plan_reference ?? '');
        setContNotes(data.contingency_plan?.notes ?? '');
        setContReviewed(toDateInput(data.contingency_plan?.last_reviewed_at ?? null));
        setContTested(toDateInput(data.contingency_plan?.last_tested_at ?? null));
        setOutageHours(
            data.contingency_plan?.max_tolerable_outage_hours != null
                ? String(data.contingency_plan.max_tolerable_outage_hours)
                : '',
        );
        setCiaC(Boolean(data.contingency_plan?.impact_confidentiality));
        setCiaI(Boolean(data.contingency_plan?.impact_integrity));
        setCiaA(Boolean(data.contingency_plan?.impact_authenticity));
        setCiaAv(Boolean(data.contingency_plan?.impact_availability));
    }, [data]);

    const save = async () => {
        try {
            setIsSaving(true);
            await vendorResilienceApi.updateResilience(vendorId, {
                exit_plan: {
                    status: exitStatus,
                    plan_reference: exitRef || null,
                    notes: exitNotes || null,
                    last_reviewed_at: fromDateInput(exitReviewed),
                    last_tested_at: fromDateInput(exitTested),
                },
                contingency_plan: {
                    max_tolerable_outage_hours: outageHours ? Number(outageHours) : null,
                    impact_confidentiality: ciaC,
                    impact_integrity: ciaI,
                    impact_authenticity: ciaA,
                    impact_availability: ciaAv,
                    status: contStatus,
                    plan_reference: contRef || null,
                    notes: contNotes || null,
                    last_reviewed_at: fromDateInput(contReviewed),
                    last_tested_at: fromDateInput(contTested),
                },
            });
            await refresh();
        } catch (err) {
            console.error('Failed to save resilience:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsSaving(false);
        }
    };

    const statusOptions = useMemo(
        () => [
            { value: 'not_started', label: t('resilience.status.not_started') },
            { value: 'in_progress', label: t('resilience.status.in_progress') },
            { value: 'complete', label: t('resilience.status.complete') },
        ],
        [t],
    );

    const needsAttention = Boolean(data?.missing_exit_plan || data?.missing_contingency_plan);

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={
                    needsAttention ? (
                        <ShieldAlert className="h-4 w-4 text-amber-300" />
                    ) : (
                        <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    )
                }
                title={t('tabs.resilience')}
                description={t('resilience.subtitle')}
                actions={canEdit ? (
                    <VendorActionButton onClick={save} disabled={isSaving} variant="primary">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('resilience.actions.save')}
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
            ) : !data ? (
                <VendorInlineMessage>{t('common:fallbacks.not_available')}</VendorInlineMessage>
            ) : (
                <div className="vendor-stack vendor-stack--lg">
                    {!data.is_required ? (
                        <VendorInlineMessage>{t('resilience.not_required')}</VendorInlineMessage>
                    ) : null}

                    {needsAttention ? (
                        <VendorInlineMessage tone="danger">
                            {t('resilience.subtitle')}
                        </VendorInlineMessage>
                    ) : null}

                    {/* Mini Status Summary */}
                    <div className="vendor-metric-strip" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                        <div className="vendor-metric">
                            <span className="vendor-metric__label">{t('resilience.exit_plan.title')}</span>
                            <VendorBadge tone={planStatusTone(exitStatus)}>
                                {t(`resilience.status.${exitStatus}`)}
                            </VendorBadge>
                        </div>
                        <div className="vendor-metric">
                            <span className="vendor-metric__label">{t('resilience.contingency_plan.title')}</span>
                            <VendorBadge tone={planStatusTone(contStatus)}>
                                {t(`resilience.status.${contStatus}`)}
                            </VendorBadge>
                        </div>
                    </div>

                    <div className="vendor-summary-grid">
                        <div className="vendor-card space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="vendor-section-title">{t('resilience.exit_plan.title')}</h3>
                                    <p className="vendor-section-description">{t('resilience.fields.reference')}</p>
                                </div>
                                <VendorBadge tone={planStatusTone(exitStatus)}>
                                    {t(`resilience.status.${exitStatus}`)}
                                </VendorBadge>
                            </div>

                            <div className="vendor-field-grid">
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.status')}</label>
                                    <ThemedSelect
                                        value={exitStatus}
                                        onValueChange={(value) => setExitStatus(value as VendorPlanStatus)}
                                        options={statusOptions}
                                        placeholder={t('resilience.fields.status')}
                                        disabled={!canEdit}
                                    />
                                </div>
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.reference')}</label>
                                    <input
                                        value={exitRef}
                                        onChange={(event) => setExitRef(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                        placeholder="https://... or file path"
                                    />
                                </div>
                            </div>

                            <div className="vendor-field-grid">
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.last_reviewed')}</label>
                                    <input
                                        type="date"
                                        value={exitReviewed}
                                        onChange={(event) => setExitReviewed(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                    />
                                </div>
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.last_tested')}</label>
                                    <input
                                        type="date"
                                        value={exitTested}
                                        onChange={(event) => setExitTested(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                    />
                                </div>
                            </div>

                            <div className="vendor-field">
                                <label className="vendor-label">{t('resilience.fields.notes')}</label>
                                <textarea
                                    value={exitNotes}
                                    onChange={(event) => setExitNotes(event.target.value)}
                                    rows={3}
                                    disabled={!canEdit}
                                    className="vendor-textarea"
                                    placeholder={t('resilience.fields.notes_placeholder')}
                                />
                            </div>
                        </div>

                        <div className="vendor-card space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="vendor-section-title">{t('resilience.contingency_plan.title')}</h3>
                                    <p className="vendor-section-description">{t('resilience.fields.outage_hours')}</p>
                                </div>
                                <VendorBadge tone={planStatusTone(contStatus)}>
                                    {t(`resilience.status.${contStatus}`)}
                                </VendorBadge>
                            </div>

                            <div className="vendor-field-grid">
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.outage_hours')}</label>
                                    <input
                                        value={outageHours}
                                        onChange={(event) => setOutageHours(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                        placeholder="24"
                                    />
                                </div>
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.status')}</label>
                                    <ThemedSelect
                                        value={contStatus}
                                        onValueChange={(value) => setContStatus(value as VendorPlanStatus)}
                                        options={statusOptions}
                                        placeholder={t('resilience.fields.status')}
                                        disabled={!canEdit}
                                    />
                                </div>
                            </div>

                            <div className="vendor-card space-y-3">
                                <div className="vendor-label">{t('resilience.fields.cia')}</div>
                                <div className="vendor-checkbox-list">
                                    <label className="vendor-checkbox">
                                        <input type="checkbox" checked={ciaC} onChange={(event) => setCiaC(event.target.checked)} disabled={!canEdit} />
                                        <span>{t('resilience.cia.confidentiality')}</span>
                                    </label>
                                    <label className="vendor-checkbox">
                                        <input type="checkbox" checked={ciaI} onChange={(event) => setCiaI(event.target.checked)} disabled={!canEdit} />
                                        <span>{t('resilience.cia.integrity')}</span>
                                    </label>
                                    <label className="vendor-checkbox">
                                        <input type="checkbox" checked={ciaA} onChange={(event) => setCiaA(event.target.checked)} disabled={!canEdit} />
                                        <span>{t('resilience.cia.authenticity')}</span>
                                    </label>
                                    <label className="vendor-checkbox">
                                        <input type="checkbox" checked={ciaAv} onChange={(event) => setCiaAv(event.target.checked)} disabled={!canEdit} />
                                        <span>{t('resilience.cia.availability')}</span>
                                    </label>
                                </div>
                                {data.contingency_required ? (
                                    <VendorInlineMessage>{t('resilience.contingency_required')}</VendorInlineMessage>
                                ) : null}
                            </div>

                            <div className="vendor-field-grid">
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.reference')}</label>
                                    <input
                                        value={contRef}
                                        onChange={(event) => setContRef(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                        placeholder="https://... or file path"
                                    />
                                </div>
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.notes')}</label>
                                    <input
                                        value={contNotes}
                                        onChange={(event) => setContNotes(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                        placeholder={t('resilience.fields.notes_placeholder')}
                                    />
                                </div>
                            </div>

                            <div className="vendor-field-grid">
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.last_reviewed')}</label>
                                    <input
                                        type="date"
                                        value={contReviewed}
                                        onChange={(event) => setContReviewed(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                    />
                                </div>
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('resilience.fields.last_tested')}</label>
                                    <input
                                        type="date"
                                        value={contTested}
                                        onChange={(event) => setContTested(event.target.value)}
                                        disabled={!canEdit}
                                        className="vendor-input"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </VendorSurface>
    );
}
