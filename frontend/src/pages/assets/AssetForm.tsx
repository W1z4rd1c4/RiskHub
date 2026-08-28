import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useAccountabilityReassignmentScenario } from '@/hooks/useAccountabilityReassignmentScenario';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { assetApi } from '@/services/assetApi';
import { lookupApi, type UserLookupItem } from '@/services/lookupApi';
import { logError } from '@/services/logger';
import type { Asset } from '@/types/asset';
import { isProcessApprovalQueuedResponse, type ProcessApprovalQueuedResponse } from '@/types/process';

import { ASSET_CONTROLLED_CODES, buildAssetWritePayload } from './assetsPagePresentation';

// Token-driven textarea styling matching the `Input` primitive (no `<Textarea>`
// primitive shipped in #58); the `aria-[invalid=true]` hook lets `Field` drive
// the error visual with no extra class.
const TEXTAREA_CLASS =
    'flex min-h-[4.5rem] w-full rounded-xl border border-input bg-input/40 px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-ring/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive resize-y';

interface AssetFormProps {
    initialData?: Asset;
    isEdit?: boolean;
    onSaved: (asset: Asset) => void;
    onApprovalQueued?: (response: ProcessApprovalQueuedResponse) => void;
    onCancel?: () => void;
}

type FormFields = {
    name: string;
    asset_type: string;
    asset_level: string;
    description: string;
    physical_location: string;
    deployment_model: string;
    alternative_names: string;
    business_owner_user_id: string;
    owning_department_id: string;
    ict_owner_user_id: string;
    gdpr_relevance: string;
    ai_relevance: string;
    data_classification: string;
    confidentiality_rating: string;
    integrity_rating: string;
    availability_rating: string;
    authenticity_rating: string;
    impact_client: string;
    impact_regulatory: string;
    substitutability_rating: string;
    vendor_dependency_rating: string;
    internet_exposed: string;
    preliminary_criticality: string;
    lifecycle_state: string;
    standard_support_end_date: string;
    extended_support_end_date: string;
    custom_support_end_date: string;
    last_legacy_risk_assessment_date: string;
    review_state: string;
    notes: string;
    request_reason: string;
};

const RATING_FIELDS = [
    'confidentiality_rating',
    'integrity_rating',
    'availability_rating',
    'authenticity_rating',
] as const;

function toFieldValue(value: string | number | null | undefined): string {
    return value === null || value === undefined ? '' : String(value);
}

function initialFields(asset?: Asset): FormFields {
    return {
        name: toFieldValue(asset?.name),
        asset_type: toFieldValue(asset?.asset_type),
        asset_level: toFieldValue(asset?.asset_level),
        description: toFieldValue(asset?.description),
        physical_location: toFieldValue(asset?.physical_location),
        deployment_model: toFieldValue(asset?.deployment_model),
        alternative_names: toFieldValue(asset?.alternative_names),
        business_owner_user_id: toFieldValue(asset?.business_owner_user_id),
        owning_department_id: toFieldValue(asset?.owning_department_id),
        ict_owner_user_id: toFieldValue(asset?.ict_owner_user_id),
        gdpr_relevance: toFieldValue(asset?.gdpr_relevance),
        ai_relevance: toFieldValue(asset?.ai_relevance),
        data_classification: toFieldValue(asset?.data_classification),
        confidentiality_rating: toFieldValue(asset?.confidentiality_rating),
        integrity_rating: toFieldValue(asset?.integrity_rating),
        availability_rating: toFieldValue(asset?.availability_rating),
        authenticity_rating: toFieldValue(asset?.authenticity_rating),
        impact_client: toFieldValue(asset?.impact_client),
        impact_regulatory: toFieldValue(asset?.impact_regulatory),
        substitutability_rating: toFieldValue(asset?.substitutability_rating),
        vendor_dependency_rating: toFieldValue(asset?.vendor_dependency_rating),
        internet_exposed: toFieldValue(asset?.internet_exposed),
        preliminary_criticality: toFieldValue(asset?.preliminary_criticality),
        lifecycle_state: toFieldValue(asset?.lifecycle_state),
        standard_support_end_date: toFieldValue(asset?.standard_support_end_date),
        extended_support_end_date: toFieldValue(asset?.extended_support_end_date),
        custom_support_end_date: toFieldValue(asset?.custom_support_end_date),
        last_legacy_risk_assessment_date: toFieldValue(asset?.last_legacy_risk_assessment_date),
        review_state: toFieldValue(asset?.review_state),
        notes: toFieldValue(asset?.notes),
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

export function AssetForm({ initialData, isEdit = false, onSaved, onApprovalQueued, onCancel }: AssetFormProps) {
    const { t } = useTranslation('assets');
    const [fields, setFields] = useState<FormFields>(() => initialFields(initialData));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
    const [businessOwnerSearch, setBusinessOwnerSearch] = useState('');
    const [ictOwnerSearch, setIctOwnerSearch] = useState('');
    const [departmentSearch, setDepartmentSearch] = useState('');
    const accountabilityScenario = useAccountabilityReassignmentScenario();

    const accountabilityChanged = Boolean(
        isEdit
        && initialData
        && (
            fields.business_owner_user_id !== toFieldValue(initialData.business_owner_user_id)
            || fields.ict_owner_user_id !== toFieldValue(initialData.ict_owner_user_id)
            || fields.owning_department_id !== toFieldValue(initialData.owning_department_id)
        ),
    );
    const protectedAssetEditApplies = Boolean(
        initialData?.derived?.cif === 'yes'
        || initialData?.derived?.resulting_criticality === 'critical',
    );
    const accountabilityChangeRequiresApproval = accountabilityChanged && (
        accountabilityScenario.isEnabled
        || (
            protectedAssetEditApplies
            && accountabilityScenario.requiresApproval('protected_asset_edit')
        )
    );
    const accountabilityScenarioUnavailable = accountabilityChanged
        && (accountabilityScenario.isLoading || accountabilityScenario.isError);
    let submitLabel = t('actions.create');
    if (accountabilityChangeRequiresApproval) {
        submitLabel = t('actions.submit_for_approval');
    } else if (isEdit) {
        submitLabel = t('actions.save');
    }

    // Required fields in DOM order — drives focus-first-invalid (N12).
    const requiredFields: Array<keyof FormFields> = [
        'name',
        'business_owner_user_id',
        'ict_owner_user_id',
        'owning_department_id',
        ...(accountabilityChangeRequiresApproval ? ['request_reason' as const] : []),
    ];
    const fieldRefs = useRef<Partial<Record<keyof FormFields, HTMLElement | null>>>({});
    const registerFieldRef = (field: keyof FormFields) => (element: HTMLElement | null) => {
        fieldRefs.current[field] = element;
    };

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const businessOwnerQuery = useQuery({
        queryKey: ictRegisterKeys.assetOwnerLookup('business_owner', businessOwnerSearch),
        queryFn: () => lookupApi.getAssetOwners({ q: businessOwnerSearch || undefined, limit: 50 }),
        staleTime: 5 * 60_000,
    });
    const ictOwnerQuery = useQuery({
        queryKey: ictRegisterKeys.assetOwnerLookup('ict_owner', ictOwnerSearch),
        queryFn: () => lookupApi.getAssetOwners({ q: ictOwnerSearch || undefined, limit: 50 }),
        staleTime: 5 * 60_000,
    });
    const departmentQuery = useQuery({
        queryKey: ictRegisterKeys.assetDepartmentLookup(departmentSearch),
        queryFn: () => lookupApi.getAssetDepartments({ q: departmentSearch || undefined, limit: 50 }),
        staleTime: 5 * 60_000,
    });

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            ratingScale: toOptions('Skala15'),
        };
    }, [closedListsQuery.data]);

    const controlledOptions = useMemo(() => {
        const options = (field: keyof typeof ASSET_CONTROLLED_CODES) =>
            ASSET_CONTROLLED_CODES[field].map((value) => ({ value, label: t(`values.${field}.${value}`) }));
        return {
            assetTypes: options('asset_type'), assetLevels: options('asset_level'),
            deploymentModels: options('deployment_model'), yesNoUndetermined: options('gdpr_relevance'),
            dataClassifications: options('data_classification'), yesNo: options('internet_exposed'),
            criticalityClasses: options('preliminary_criticality'), lifecycleStates: options('lifecycle_state'),
            reviewStates: options('review_state'),
        };
    }, [t]);

    const ownerOptions = useCallback((data: UserLookupItem[] | undefined, currentId: number | null | undefined, currentOwner: Asset['business_owner']) => {
        const options = (data ?? []).map((user) => ({
            value: String(user.id),
            label: [`${user.name} — ${user.email}`, user.department_name ?? t('form.owner_no_department'), user.role_name ?? t('form.owner_no_role')].join(' · '),
        }));
        if (currentId && currentOwner && !options.some((option) => option.value === String(currentId))) {
            options.push({ value: String(currentId), label: [currentOwner.name, currentOwner.department_name ?? t('form.owner_no_department'), currentOwner.role_name].join(' · ') });
        }
        return options;
    }, [t]);
    const businessOwnerOptions = useMemo(() => ownerOptions(businessOwnerQuery.data, initialData?.business_owner_user_id, initialData?.business_owner), [businessOwnerQuery.data, initialData, ownerOptions]);
    const ictOwnerOptions = useMemo(() => ownerOptions(ictOwnerQuery.data, initialData?.ict_owner_user_id, initialData?.ict_owner), [ictOwnerQuery.data, initialData, ownerOptions]);
    const departmentOptions = useMemo(() => {
        const options = (departmentQuery.data ?? []).map((department) => ({ value: String(department.id), label: `${department.name} (${department.code})` }));
        if (initialData?.owning_department_id && initialData.owning_department && !options.some((option) => option.value === String(initialData.owning_department_id))) {
            options.push({ value: String(initialData.owning_department_id), label: `${initialData.owning_department.name} (${initialData.owning_department.code})` });
        }
        return options;
    }, [departmentQuery.data, initialData]);

    const setField = (field: keyof FormFields, value: string) => {
        setFields((current) => ({ ...current, [field]: value }));
    };

    const setBusinessOwner = (value: string) => {
        const selected = (businessOwnerQuery.data ?? []).find((owner) => String(owner.id) === value);
        setFields((current) => ({
            ...current,
            business_owner_user_id: value,
            owning_department_id: current.owning_department_id || selected?.department_id?.toString() || '',
        }));
    };

    const validate = (): Partial<Record<keyof FormFields, string>> => {
        const nextErrors: Partial<Record<keyof FormFields, string>> = {};
        if (!fields.name.trim()) {
            nextErrors.name = t('form.errors.name_required');
        }
        if (!fields.business_owner_user_id) nextErrors.business_owner_user_id = t('form.errors.business_owner_required');
        if (!fields.ict_owner_user_id) nextErrors.ict_owner_user_id = t('form.errors.ict_owner_required');
        if (!fields.owning_department_id) nextErrors.owning_department_id = t('form.errors.owning_department_required');
        if (accountabilityChangeRequiresApproval && !fields.request_reason.trim()) {
            nextErrors.request_reason = t('form.errors.request_reason_required');
        }
        return nextErrors;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (accountabilityScenarioUnavailable) return;
        const validationErrors = validate();
        setFieldErrors(validationErrors);
        const firstInvalid = requiredFields.find((field) => validationErrors[field]);
        if (firstInvalid) {
            fieldRefs.current[firstInvalid]?.focus();
            return;
        }

        const payload = buildAssetWritePayload({
            name: fields.name,
            asset_type: fields.asset_type,
            asset_level: fields.asset_level,
            description: fields.description,
            physical_location: fields.physical_location,
            deployment_model: fields.deployment_model,
            alternative_names: fields.alternative_names,
            business_owner_user_id: Number(fields.business_owner_user_id),
            ict_owner_user_id: Number(fields.ict_owner_user_id),
            owning_department_id: Number(fields.owning_department_id),
            gdpr_relevance: fields.gdpr_relevance,
            ai_relevance: fields.ai_relevance,
            data_classification: fields.data_classification,
            confidentiality_rating: toNullableInt(fields.confidentiality_rating),
            integrity_rating: toNullableInt(fields.integrity_rating),
            availability_rating: toNullableInt(fields.availability_rating),
            authenticity_rating: toNullableInt(fields.authenticity_rating),
            impact_client: toNullableInt(fields.impact_client),
            impact_regulatory: toNullableInt(fields.impact_regulatory),
            substitutability_rating: toNullableInt(fields.substitutability_rating),
            vendor_dependency_rating: toNullableInt(fields.vendor_dependency_rating),
            internet_exposed: fields.internet_exposed,
            preliminary_criticality: fields.preliminary_criticality,
            lifecycle_state: fields.lifecycle_state,
            standard_support_end_date: fields.standard_support_end_date,
            extended_support_end_date: fields.extended_support_end_date,
            custom_support_end_date: fields.custom_support_end_date,
            last_legacy_risk_assessment_date: fields.last_legacy_risk_assessment_date,
            review_state: fields.review_state,
            notes: fields.notes,
            request_reason: fields.request_reason.trim() || undefined,
        });

        try {
            setIsSubmitting(true);
            setError(null);
            const saved = isEdit && initialData
                ? await assetApi.updateAsset(initialData.id, payload)
                : await assetApi.createAsset(payload);
            if (isProcessApprovalQueuedResponse(saved)) {
                onApprovalQueued?.(saved);
            } else {
                onSaved(saved);
            }
        } catch (submitError) {
            logError('Failed to save asset:', submitError);
            setError(t('form.errors.save_failed'));
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

            {closedListsQuery.isError || businessOwnerQuery.isError || ictOwnerQuery.isError || departmentQuery.isError ? (
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
                            void businessOwnerQuery.refetch();
                            void ictOwnerQuery.refetch();
                            void departmentQuery.refetch();
                        }}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-100 transition-colors hover:bg-white/10"
                    >
                        {t('actions.retry')}
                    </button>
                </div>
            ) : null}

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.identity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {textField('name', t('form.name'), 'asset-form-name', { required: true })}
                    {selectField('asset_type', t('form.asset_type'), controlledOptions.assetTypes, 'asset-form-asset-type')}
                    {selectField('asset_level', t('form.asset_level'), controlledOptions.assetLevels, 'asset-form-asset-level')}
                    {selectField('deployment_model', t('form.deployment_model'), controlledOptions.deploymentModels, 'asset-form-deployment-model')}
                    {textField('physical_location', t('form.physical_location'), 'asset-form-physical-location')}
                    {textField('alternative_names', t('form.alternative_names'), 'asset-form-alternative-names')}
                </div>
                <Field label={t('form.description')} labelClassName={labelClassName}>
                    {(control) => (
                        <textarea
                            {...control}
                            data-testid="asset-form-description"
                            value={fields.description}
                            onChange={(event) => setField('description', event.target.value)}
                            rows={2}
                            className={TEXTAREA_CLASS}
                        />
                    )}
                </Field>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ownership')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <Field label={t('form.business_owner')} required error={fieldErrors.business_owner_user_id} labelClassName={labelClassName}>
                        {(control) => <SearchableEntitySelect {...control} value={fields.business_owner_user_id} onValueChange={setBusinessOwner} options={businessOwnerOptions} searchValue={businessOwnerSearch} onSearchChange={setBusinessOwnerSearch} placeholder={t('form.business_owner_placeholder')} searchPlaceholder={t('form.owner_search')} triggerTestId="asset-form-business-owner" triggerRef={registerFieldRef('business_owner_user_id')} />}
                    </Field>
                    <Field label={t('form.ict_owner')} required error={fieldErrors.ict_owner_user_id} labelClassName={labelClassName}>
                        {(control) => <SearchableEntitySelect {...control} value={fields.ict_owner_user_id} onValueChange={(value) => setField('ict_owner_user_id', value)} options={ictOwnerOptions} searchValue={ictOwnerSearch} onSearchChange={setIctOwnerSearch} placeholder={t('form.ict_owner_placeholder')} searchPlaceholder={t('form.owner_search')} triggerTestId="asset-form-ict-owner" triggerRef={registerFieldRef('ict_owner_user_id')} />}
                    </Field>
                    <Field label={t('form.owner_department')} required error={fieldErrors.owning_department_id} labelClassName={labelClassName}>
                        {(control) => <SearchableEntitySelect {...control} value={fields.owning_department_id} onValueChange={(value) => setField('owning_department_id', value)} options={departmentOptions} searchValue={departmentSearch} onSearchChange={setDepartmentSearch} placeholder={t('form.department_placeholder')} searchPlaceholder={t('form.department_search')} triggerTestId="asset-form-owner-department" triggerRef={registerFieldRef('owning_department_id')} />}
                    </Field>
                    {selectField('gdpr_relevance', t('form.gdpr_relevance'), controlledOptions.yesNoUndetermined, 'asset-form-gdpr-relevance')}
                    {selectField('ai_relevance', t('form.ai_relevance'), controlledOptions.yesNoUndetermined, 'asset-form-ai-relevance')}
                    {selectField('data_classification', t('form.data_classification'), controlledOptions.dataClassifications, 'asset-form-data-classification')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ratings')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    {RATING_FIELDS.map((field) => (
                        <div key={field} className="contents">
                            {selectField(field, t(`form.${field}`), listOptions.ratingScale, `asset-form-${field.replaceAll('_', '-')}`)}
                        </div>
                    ))}
                </div>
                <p className="text-xs text-slate-500">{t('form.ratings_note')}</p>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.impact_dependencies')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    {selectField('impact_client', t('form.impact_client'), listOptions.ratingScale, 'asset-form-impact-client')}
                    {selectField('impact_regulatory', t('form.impact_regulatory'), listOptions.ratingScale, 'asset-form-impact-regulatory')}
                    {selectField('substitutability_rating', t('form.substitutability_rating'), listOptions.ratingScale, 'asset-form-substitutability-rating')}
                    {selectField('vendor_dependency_rating', t('form.vendor_dependency_rating'), listOptions.ratingScale, 'asset-form-vendor-dependency-rating')}
                    {selectField('internet_exposed', t('form.internet_exposed'), controlledOptions.yesNo, 'asset-form-internet-exposed')}
                    {selectField('preliminary_criticality', t('form.preliminary_criticality'), controlledOptions.criticalityClasses, 'asset-form-preliminary-criticality')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.lifecycle')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    {selectField('lifecycle_state', t('form.lifecycle_state'), controlledOptions.lifecycleStates, 'asset-form-lifecycle-state')}
                    {textField('standard_support_end_date', t('form.standard_support_end_date'), 'asset-form-standard-support-end-date', { type: 'date' })}
                    {textField('extended_support_end_date', t('form.extended_support_end_date'), 'asset-form-extended-support-end-date', { type: 'date' })}
                    {textField('custom_support_end_date', t('form.custom_support_end_date'), 'asset-form-custom-support-end-date', { type: 'date' })}
                    {textField('last_legacy_risk_assessment_date', t('form.last_legacy_risk_assessment_date'), 'asset-form-last-legacy-risk-assessment-date', { type: 'date' })}
                    {selectField('review_state', t('form.review_state'), controlledOptions.reviewStates, 'asset-form-review-state')}
                </div>
                <Field label={t('form.notes')} labelClassName={labelClassName}>
                    {(control) => (
                        <textarea
                            {...control}
                            data-testid="asset-form-notes"
                            value={fields.notes}
                            onChange={(event) => setField('notes', event.target.value)}
                            rows={3}
                            className={TEXTAREA_CLASS}
                        />
                    )}
                </Field>
                <Field
                    label={t('form.request_reason')}
                    required={accountabilityChangeRequiresApproval}
                    error={fieldErrors.request_reason}
                    help={t('form.request_reason_help')}
                    labelClassName={labelClassName}
                >
                    {(control) => (
                        <textarea
                            {...control}
                            ref={registerFieldRef('request_reason')}
                            data-testid="asset-form-request-reason"
                            value={fields.request_reason}
                            onChange={(event) => setField('request_reason', event.target.value)}
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
                    disabled={isSubmitting || accountabilityScenarioUnavailable}
                    data-testid="asset-form-submit"
                    className="px-5 py-2.5 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    <Save className={cn('h-4 w-4', isSubmitting && 'animate-pulse')} />
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
