import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/services/apiClient';
import { lookupApi } from '@/services/lookupApi';
import { processApi } from '@/services/processApi';
import { logError } from '@/services/logger';
import {
    isProcessApprovalQueuedResponse,
    type Process,
    type ProcessApprovalQueuedResponse,
} from '@/types/process';

import { buildProcessWritePayload, PROCESS_CONTROLLED_CODES } from './processesPagePresentation';
import { processEditNeedsRequestReason } from './processProtectedEdit';

// Token-driven textarea styling matching the `Input` primitive (no `<Textarea>`
// primitive shipped in #58); the `aria-[invalid=true]` hook lets `Field` drive
// the error visual with no extra class.
const TEXTAREA_CLASS =
    'flex min-h-[4.5rem] w-full rounded-xl border border-input bg-input/40 px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-ring/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive resize-y';

interface ProcessFormProps {
    initialData?: Process;
    isEdit?: boolean;
    onSaved: (process: Process) => void;
    onApprovalQueued?: (response: ProcessApprovalQueuedResponse) => void;
    onCancel?: () => void;
}

type FormFields = {
    l0_area: string;
    l1_process: string;
    l2_subprocess: string;
    process_owner_user_id: string;
    owning_department_id: string;
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
    request_reason: string;
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
        process_owner_user_id: toFieldValue(process?.process_owner_user_id),
        owning_department_id: toFieldValue(process?.owning_department_id),
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
        request_reason: '',
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

export function ProcessForm({
    initialData,
    isEdit = false,
    onSaved,
    onApprovalQueued,
    onCancel,
}: ProcessFormProps) {
    const { t } = useTranslation('processes');
    const [fields, setFields] = useState<FormFields>(() => initialFields(initialData));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
    const [ownerSearch, setOwnerSearch] = useState('');
    const [departmentSearch, setDepartmentSearch] = useState('');
    const [serverRequiredRoutingSignature, setServerRequiredRoutingSignature] = useState<string | null>(null);
    const protectedChangeRequiresApproval = resolveCapabilityFlag(
        initialData?.capabilities,
        'protected_change_requires_approval',
    );
    const canRequestChange = resolveCapabilityFlag(initialData?.capabilities, 'can_request_change');
    const protectionRoutingSignature = [
        initialData?.id ?? '',
        protectedChangeRequiresApproval ? 'enabled' : 'disabled',
        canRequestChange ? 'requestable' : 'blocked',
        initialData?.derived?.cif ?? '',
        initialData?.derived?.inputs.threshold_critical_score ?? '',
        initialData?.derived?.inputs.mtpd_critical_hours ?? '',
        fields.cif_override,
        fields.preliminary_criticality,
        fields.mtpd_hours,
        fields.impact_client,
        fields.impact_market_operations,
        fields.impact_regulatory,
        fields.impact_financial,
    ].join('|');
    const protectionRoutingSignatureRef = useRef(protectionRoutingSignature);
    protectionRoutingSignatureRef.current = protectionRoutingSignature;

    useEffect(() => {
        setServerRequiredRoutingSignature(null);
        setFieldErrors((current) => {
            if (!current.request_reason) return current;
            const { request_reason: _requestReason, ...remaining } = current;
            return remaining;
        });
    }, [protectionRoutingSignature]);

    const serverRequiresApproval = serverRequiredRoutingSignature === protectionRoutingSignature;
    const requestReasonRequired = Boolean(
        serverRequiresApproval
        || (
            isEdit
            && initialData !== undefined
            && (
                protectedChangeRequiresApproval
                && canRequestChange
                && processEditNeedsRequestReason(initialData, fields)
            )
        )
    );

    // Required fields in DOM order — drives focus-first-invalid (N12).
    const requiredFields: Array<keyof FormFields> = [
        'l0_area',
        'l1_process',
        'process_owner_user_id',
        'owning_department_id',
        ...(requestReasonRequired ? ['request_reason' as const] : []),
    ];
    const fieldRefs = useRef<Partial<Record<keyof FormFields, HTMLElement | null>>>({});
    const registerFieldRef = (field: keyof FormFields) => (element: HTMLElement | null) => {
        fieldRefs.current[field] = element;
    };

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => processApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const ownerQuery = useQuery({
        queryKey: ictRegisterKeys.processOwnerLookup(ownerSearch),
        queryFn: () => lookupApi.getProcessOwners({ q: ownerSearch || undefined, limit: 50 }),
        staleTime: 5 * 60_000,
    });

    const departmentQuery = useQuery({
        queryKey: ictRegisterKeys.processDepartmentLookup(departmentSearch),
        queryFn: () => lookupApi.getProcessDepartments({ q: departmentSearch || undefined, limit: 50 }),
        staleTime: 5 * 60_000,
    });

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            impactScale: toOptions('Skala15'),
        };
    }, [closedListsQuery.data]);

    const controlledOptions = useMemo(() => {
        const options = (field: keyof typeof PROCESS_CONTROLLED_CODES) =>
            PROCESS_CONTROLLED_CODES[field].map((value) => ({
                value,
                label: t(`values.${field}.${value}`),
            }));
        return {
            preliminaryCriticality: options('preliminary_criticality'),
            cifOverride: options('cif_override'),
            licensedActivity: options('licensed_activity'),
            bcmLink: options('bcm_link'),
            drTestResult: options('dr_test_result'),
            interruptionImpact: options('interruption_impact'),
        };
    }, [t]);

    const ownerOptions = useMemo(() => {
        const options = (ownerQuery.data ?? []).map((user) => ({
            value: String(user.id),
            label: [
                `${user.name} — ${user.email}`,
                user.department_name ?? t('form.owner_no_department'),
                user.role_name ?? t('form.owner_no_role'),
            ].join(' · '),
        }));
        if (initialData?.process_owner_user_id && initialData.process_owner
            && !options.some((option) => option.value === String(initialData.process_owner_user_id))) {
            options.push({
                value: String(initialData.process_owner_user_id),
                label: [
                    `${initialData.process_owner.name} — ${initialData.process_owner.email}`,
                    initialData.process_owner.department_name ?? t('form.owner_no_department'),
                    initialData.process_owner.role_name,
                ].join(' · '),
            });
        }
        return options;
    }, [initialData, ownerQuery.data, t]);

    const departmentOptions = useMemo(() => {
        const options = (departmentQuery.data ?? []).map((department) => ({
            value: String(department.id),
            label: `${department.name} (${department.code})`,
        }));
        if (initialData?.owning_department_id && initialData.owning_department
            && !options.some((option) => option.value === String(initialData.owning_department_id))) {
            options.push({
                value: String(initialData.owning_department_id),
                label: `${initialData.owning_department.name} (${initialData.owning_department.code})`,
            });
        }
        return options;
    }, [departmentQuery.data, initialData]);

    const setField = (field: keyof FormFields, value: string) => {
        setFields((current) => ({ ...current, [field]: value }));
    };

    const setProcessOwner = (value: string) => {
        const selectedOwner = (ownerQuery.data ?? []).find((user) => String(user.id) === value);
        setFields((current) => ({
            ...current,
            process_owner_user_id: value,
            owning_department_id: current.owning_department_id || selectedOwner?.department_id?.toString() || '',
        }));
    };

    const validate = (): Partial<Record<keyof FormFields, string>> => {
        const nextErrors: Partial<Record<keyof FormFields, string>> = {};
        if (!fields.l0_area.trim()) {
            nextErrors.l0_area = t('form.errors.l0_area_required');
        }
        if (!fields.l1_process.trim()) {
            nextErrors.l1_process = t('form.errors.l1_process_required');
        }
        if (!fields.process_owner_user_id) {
            nextErrors.process_owner_user_id = t('form.errors.process_owner_required');
        }
        if (!fields.owning_department_id) {
            nextErrors.owning_department_id = t('form.errors.owning_department_required');
        }
        if (requestReasonRequired && !fields.request_reason.trim()) {
            nextErrors.request_reason = t('form.errors.request_reason_required');
        }
        return nextErrors;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const validationErrors = validate();
        setFieldErrors(validationErrors);
        const firstInvalid = requiredFields.find((field) => validationErrors[field]);
        if (firstInvalid) {
            fieldRefs.current[firstInvalid]?.focus();
            return;
        }

        const payload = buildProcessWritePayload({
            l0_area: fields.l0_area,
            l1_process: fields.l1_process,
            l2_subprocess: fields.l2_subprocess,
            process_owner_user_id: Number(fields.process_owner_user_id),
            owning_department_id: Number(fields.owning_department_id),
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
        if (fields.request_reason.trim()) {
            payload.request_reason = fields.request_reason.trim();
        }

        try {
            setIsSubmitting(true);
            setError(null);
            const result = isEdit && initialData
                ? await processApi.updateProcess(initialData.id, payload)
                : await processApi.createProcess(payload);
            if (isProcessApprovalQueuedResponse(result)) {
                setServerRequiredRoutingSignature(null);
                onApprovalQueued?.(result);
                return;
            }
            setServerRequiredRoutingSignature(null);
            onSaved(result);
        } catch (submitError) {
            logError('Failed to save process:', submitError);
            if (submitError instanceof ApiClientError && submitError.code === 'process_pending_mutation') {
                setError(t('form.errors.pending_change_exists'));
            } else if (
                submitError instanceof ApiClientError
                && submitError.status === 422
                && submitError.code === 'governed_mutation_reason_required'
                && protectionRoutingSignatureRef.current === protectionRoutingSignature
            ) {
                setServerRequiredRoutingSignature(protectionRoutingSignature);
                setError(null);
                setFieldErrors((current) => ({
                    ...current,
                    request_reason: t('form.errors.request_reason_required'),
                }));
                fieldRefs.current.request_reason?.focus();
            } else {
                setError(t('form.errors.save_failed'));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const labelClassName = 'text-xs font-bold uppercase tracking-widest text-slate-500';

    const selectField = (
        field: keyof FormFields,
        label: string,
        options: Array<{ value: string; label: string }>,
        testId: string,
    ) => (
        <Field label={label} error={fieldErrors[field]} labelClassName={labelClassName}>
            {(control) => (
                <ThemedSelect
                    {...control}
                    value={fields[field]}
                    onValueChange={(value) => setField(field, value)}
                    options={options}
                    allowEmpty
                    emptyLabel={t('form.not_set')}
                    placeholder={t('form.not_set')}
                    triggerTestId={testId}
                />
            )}
        </Field>
    );

    const textField = (
        field: keyof FormFields,
        label: string,
        testId: string,
        props: React.InputHTMLAttributes<HTMLInputElement> = {},
    ) => (
        <Field
            label={label}
            required={props.required}
            error={fieldErrors[field]}
            labelClassName={labelClassName}
        >
            {(control) => (
                <Input
                    {...control}
                    {...props}
                    ref={registerFieldRef(field)}
                    data-testid={testId}
                    value={fields[field]}
                    onChange={(event) => setField(field, event.target.value)}
                />
            )}
        </Field>
    );

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    return (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            {error || hasFieldErrors ? (
                <div role="alert" className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error ?? t('form.errors.fix_fields')}</p>
                </div>
            ) : null}

            {closedListsQuery.isError || ownerQuery.isError || departmentQuery.isError ? (
                <div
                    role="status"
                    className="glass-card flex items-center justify-between gap-3 border border-amber-400/30 text-amber-200"
                >
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p className="text-sm font-medium">{t('form.errors.lists_failed')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void closedListsQuery.refetch();
                            void ownerQuery.refetch();
                            void departmentQuery.refetch();
                        }}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-100 transition-colors hover:bg-white/10"
                    >
                        {t('actions.retry')}
                    </button>
                </div>
            ) : null}

            <section className="glass-card space-y-4 border border-amber-400/20">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                            {t('form.sections.change_request')}
                        </h2>
                        <p className="mt-2 text-sm text-slate-500">
                            {t('form.request_reason_help')}
                        </p>
                    </div>
                    <Field
                        label={t('form.request_reason')}
                        required={requestReasonRequired}
                        error={fieldErrors.request_reason}
                        labelClassName={labelClassName}
                    >
                        {(control) => (
                            <textarea
                                {...control}
                                ref={registerFieldRef('request_reason')}
                                data-testid="process-form-request-reason"
                                value={fields.request_reason}
                                onChange={(event) => setField('request_reason', event.target.value)}
                                rows={3}
                                className={TEXTAREA_CLASS}
                            />
                        )}
                    </Field>
            </section>

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
                    <Field
                        label={t('form.owner')}
                        required
                        error={fieldErrors.process_owner_user_id}
                        labelClassName={labelClassName}
                    >
                        {(control) => (
                            <SearchableEntitySelect
                                {...control}
                                value={fields.process_owner_user_id}
                                onValueChange={setProcessOwner}
                                options={ownerOptions}
                                searchValue={ownerSearch}
                                onSearchChange={setOwnerSearch}
                                placeholder={t('form.owner_placeholder')}
                                searchPlaceholder={t('form.owner_search')}
                                triggerTestId="process-form-owner"
                                triggerRef={registerFieldRef('process_owner_user_id')}
                            />
                        )}
                    </Field>
                    <Field
                        label={t('form.owner_department')}
                        required
                        error={fieldErrors.owning_department_id}
                        labelClassName={labelClassName}
                    >
                        {(control) => (
                            <SearchableEntitySelect
                                {...control}
                                value={fields.owning_department_id}
                                onValueChange={(value) => setField('owning_department_id', value)}
                                options={departmentOptions}
                                searchValue={departmentSearch}
                                onSearchChange={setDepartmentSearch}
                                placeholder={t('form.department_placeholder')}
                                searchPlaceholder={t('form.department_search')}
                                triggerTestId="process-form-owner-department"
                                triggerRef={registerFieldRef('owning_department_id')}
                            />
                        )}
                    </Field>
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
                    {selectField('preliminary_criticality', t('form.preliminary_criticality'), controlledOptions.preliminaryCriticality, 'process-form-preliminary-criticality')}
                    {selectField('cif_override', t('form.cif_override'), controlledOptions.cifOverride, 'process-form-cif-override')}
                    {selectField('licensed_activity', t('form.licensed_activity'), controlledOptions.licensedActivity, 'process-form-licensed-activity')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.continuity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {textField('rto_hours', t('form.rto_hours'), 'process-form-rto-hours', { type: 'number', min: 0 })}
                    {textField('rpo_hours', t('form.rpo_hours'), 'process-form-rpo-hours', { type: 'number', min: 0 })}
                    {selectField('bcm_link', t('form.bcm_link'), controlledOptions.bcmLink, 'process-form-bcm-link')}
                    {textField('last_dr_test_date', t('form.last_dr_test_date'), 'process-form-last-dr-test-date', { type: 'date' })}
                    {selectField('dr_test_result', t('form.dr_test_result'), controlledOptions.drTestResult, 'process-form-dr-test-result')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.assessment')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {selectField('interruption_impact', t('form.interruption_impact'), controlledOptions.interruptionImpact, 'process-form-interruption-impact')}
                    {textField('assessment_date', t('form.assessment_date'), 'process-form-assessment-date', { type: 'date' })}
                </div>
                <Field label={t('form.notes')} labelClassName={labelClassName}>
                    {(control) => (
                        <textarea
                            {...control}
                            data-testid="process-form-notes"
                            value={fields.notes}
                            onChange={(event) => setField('notes', event.target.value)}
                            rows={3}
                            className={TEXTAREA_CLASS}
                        />
                    )}
                </Field>
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
                    {requestReasonRequired
                        ? t('actions.submit_for_approval')
                        : isEdit
                            ? t('actions.save')
                            : t('actions.create')}
                </button>
            </div>
        </form>
    );
}
