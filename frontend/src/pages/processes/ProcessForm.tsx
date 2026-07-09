import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, X } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { processApi } from '@/services/processApi';
import { logError } from '@/services/logger';
import type { Process } from '@/types/process';

import { buildProcessWritePayload } from './processesPagePresentation';

interface ProcessFormProps {
    initialData?: Process;
    isEdit?: boolean;
    onSaved: (process: Process) => void;
    onCancel?: () => void;
}

type FormFields = {
    l0_area: string;
    l1_process: string;
    l2_subprocess: string;
    owner: string;
    owner_department: string;
    impact_client: string;
    impact_market_operations: string;
    impact_regulatory: string;
    impact_financial: string;
    impact_reputational: string;
    mtpd_hours: string;
    preliminary_criticality: string;
    cif_override: string;
    licensed_activity: string;
    rto_hours: string;
    rpo_hours: string;
    bcm_link: string;
    last_dr_test_date: string;
    dr_test_result: string;
    interruption_impact: string;
    assessment_date: string;
    notes: string;
};

const IMPACT_FIELDS = [
    'impact_client',
    'impact_market_operations',
    'impact_regulatory',
    'impact_financial',
    'impact_reputational',
] as const;

function toFieldValue(value: string | number | null | undefined): string {
    return value === null || value === undefined ? '' : String(value);
}

function initialFields(process?: Process): FormFields {
    return {
        l0_area: toFieldValue(process?.l0_area),
        l1_process: toFieldValue(process?.l1_process),
        l2_subprocess: toFieldValue(process?.l2_subprocess),
        owner: toFieldValue(process?.owner),
        owner_department: toFieldValue(process?.owner_department),
        impact_client: toFieldValue(process?.impact_client),
        impact_market_operations: toFieldValue(process?.impact_market_operations),
        impact_regulatory: toFieldValue(process?.impact_regulatory),
        impact_financial: toFieldValue(process?.impact_financial),
        impact_reputational: toFieldValue(process?.impact_reputational),
        mtpd_hours: toFieldValue(process?.mtpd_hours),
        preliminary_criticality: toFieldValue(process?.preliminary_criticality),
        cif_override: toFieldValue(process?.cif_override),
        licensed_activity: toFieldValue(process?.licensed_activity),
        rto_hours: toFieldValue(process?.rto_hours),
        rpo_hours: toFieldValue(process?.rpo_hours),
        bcm_link: toFieldValue(process?.bcm_link),
        last_dr_test_date: toFieldValue(process?.last_dr_test_date),
        dr_test_result: toFieldValue(process?.dr_test_result),
        interruption_impact: toFieldValue(process?.interruption_impact),
        assessment_date: toFieldValue(process?.assessment_date),
        notes: toFieldValue(process?.notes),
    };
}

function toNullableInt(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '') {
        return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function ProcessForm({ initialData, isEdit = false, onSaved, onCancel }: ProcessFormProps) {
    const { t } = useTranslation('processes');
    const [fields, setFields] = useState<FormFields>(() => initialFields(initialData));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => processApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            departments: toOptions('VlastnickyUtvar'),
            criticalityClasses: toOptions('TridyKrit'),
            yesNo: toOptions('AnoNe'),
            licensedActivities: toOptions('LicCinnost'),
            bcmLinks: toOptions('BcmVazba'),
            drResults: toOptions('VysledekDR'),
            interruptionImpacts: toOptions('DopadPreruseni'),
            impactScale: toOptions('Skala15'),
        };
    }, [closedListsQuery.data]);

    const setField = (field: keyof FormFields, value: string) => {
        setFields((current) => ({ ...current, [field]: value }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!fields.l0_area.trim() || !fields.l1_process.trim()) {
            setError(t('form.errors.identity_required'));
            return;
        }

        const payload = buildProcessWritePayload({
            l0_area: fields.l0_area,
            l1_process: fields.l1_process,
            l2_subprocess: fields.l2_subprocess,
            owner: fields.owner,
            owner_department: fields.owner_department,
            impact_client: toNullableInt(fields.impact_client),
            impact_market_operations: toNullableInt(fields.impact_market_operations),
            impact_regulatory: toNullableInt(fields.impact_regulatory),
            impact_financial: toNullableInt(fields.impact_financial),
            impact_reputational: toNullableInt(fields.impact_reputational),
            mtpd_hours: toNullableInt(fields.mtpd_hours),
            preliminary_criticality: fields.preliminary_criticality,
            cif_override: fields.cif_override,
            licensed_activity: fields.licensed_activity,
            rto_hours: toNullableInt(fields.rto_hours),
            rpo_hours: toNullableInt(fields.rpo_hours),
            bcm_link: fields.bcm_link,
            last_dr_test_date: fields.last_dr_test_date,
            dr_test_result: fields.dr_test_result,
            interruption_impact: fields.interruption_impact,
            assessment_date: fields.assessment_date,
            notes: fields.notes,
        });

        try {
            setIsSubmitting(true);
            setError(null);
            const saved = isEdit && initialData
                ? await processApi.updateProcess(initialData.id, payload)
                : await processApi.createProcess(payload);
            onSaved(saved);
        } catch (submitError) {
            logError('Failed to save process:', submitError);
            setError(t('form.errors.save_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectField = (
        field: keyof FormFields,
        label: string,
        options: Array<{ value: string; label: string }>,
        testId: string,
    ) => (
        <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</label>
            <ThemedSelect
                value={fields[field]}
                onValueChange={(value) => setField(field, value)}
                options={options}
                allowEmpty
                emptyLabel={t('form.not_set')}
                placeholder={t('form.not_set')}
                triggerTestId={testId}
            />
        </div>
    );

    const textField = (
        field: keyof FormFields,
        label: string,
        testId: string,
        props: React.InputHTMLAttributes<HTMLInputElement> = {},
    ) => (
        <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</label>
            <input
                data-testid={testId}
                value={fields[field]}
                onChange={(event) => setField(field, event.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                {...props}
            />
        </div>
    );

    return (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            {error ? (
                <div className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            ) : null}

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.identity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {textField('l0_area', t('form.l0_area'), 'process-form-l0-area', { required: true })}
                    {textField('l1_process', t('form.l1_process'), 'process-form-l1-process', { required: true })}
                    {textField('l2_subprocess', t('form.l2_subprocess'), 'process-form-l2-subprocess')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ownership')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {textField('owner', t('form.owner'), 'process-form-owner')}
                    {selectField('owner_department', t('form.owner_department'), listOptions.departments, 'process-form-owner-department')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.impacts')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {IMPACT_FIELDS.map((field) =>
                        selectField(field, t(`form.${field}`), listOptions.impactScale, `process-form-${field.replaceAll('_', '-')}`)
                    )}
                    {textField('mtpd_hours', t('form.mtpd_hours'), 'process-form-mtpd-hours', {
                        type: 'number',
                        min: 0,
                    })}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.criticality')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {selectField('preliminary_criticality', t('form.preliminary_criticality'), listOptions.criticalityClasses, 'process-form-preliminary-criticality')}
                    {selectField('cif_override', t('form.cif_override'), listOptions.yesNo, 'process-form-cif-override')}
                    {selectField('licensed_activity', t('form.licensed_activity'), listOptions.licensedActivities, 'process-form-licensed-activity')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.continuity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {textField('rto_hours', t('form.rto_hours'), 'process-form-rto-hours', { type: 'number', min: 0 })}
                    {textField('rpo_hours', t('form.rpo_hours'), 'process-form-rpo-hours', { type: 'number', min: 0 })}
                    {selectField('bcm_link', t('form.bcm_link'), listOptions.bcmLinks, 'process-form-bcm-link')}
                    {textField('last_dr_test_date', t('form.last_dr_test_date'), 'process-form-last-dr-test-date', { type: 'date' })}
                    {selectField('dr_test_result', t('form.dr_test_result'), listOptions.drResults, 'process-form-dr-test-result')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.assessment')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {selectField('interruption_impact', t('form.interruption_impact'), listOptions.interruptionImpacts, 'process-form-interruption-impact')}
                    {textField('assessment_date', t('form.assessment_date'), 'process-form-assessment-date', { type: 'date' })}
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.notes')}</label>
                    <textarea
                        data-testid="process-form-notes"
                        value={fields.notes}
                        onChange={(event) => setField('notes', event.target.value)}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                    />
                </div>
            </section>

            <div className="flex items-center justify-end gap-3">
                {onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                    >
                        <X className="h-4 w-4" />
                        {t('actions.cancel')}
                    </button>
                ) : null}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="process-form-submit"
                    className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    <Save className={cn('h-4 w-4', isSubmitting && 'animate-pulse')} />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </button>
            </div>
        </form>
    );
}
