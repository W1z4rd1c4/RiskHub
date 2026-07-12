import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import type { Asset } from '@/types/asset';

import { buildAssetWritePayload } from './assetsPagePresentation';

// Token-driven textarea styling matching the `Input` primitive (no `<Textarea>`
// primitive shipped in #58); the `aria-[invalid=true]` hook lets `Field` drive
// the error visual with no extra class.
const TEXTAREA_CLASS =
    'flex min-h-[4.5rem] w-full rounded-xl border border-input bg-input/40 px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-ring/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive resize-y';

interface AssetFormProps {
    initialData?: Asset;
    isEdit?: boolean;
    onSaved: (asset: Asset) => void;
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
    business_owner: string;
    owner_department: string;
    ict_owner: string;
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
        business_owner: toFieldValue(asset?.business_owner),
        owner_department: toFieldValue(asset?.owner_department),
        ict_owner: toFieldValue(asset?.ict_owner),
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

export function AssetForm({ initialData, isEdit = false, onSaved, onCancel }: AssetFormProps) {
    const { t } = useTranslation('assets');
    const [fields, setFields] = useState<FormFields>(() => initialFields(initialData));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});

    // Required fields in DOM order — drives focus-first-invalid (N12).
    const REQUIRED_FIELDS: Array<keyof FormFields> = ['name'];
    const fieldRefs = useRef<Partial<Record<keyof FormFields, HTMLInputElement | null>>>({});
    const registerFieldRef = (field: keyof FormFields) => (element: HTMLInputElement | null) => {
        fieldRefs.current[field] = element;
    };

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            assetTypes: toOptions('TypAktiva'),
            assetLevels: toOptions('UrovenAktiva'),
            deploymentModels: toOptions('ModelNasazeni'),
            departments: toOptions('VlastnickyUtvar'),
            yesNoUndetermined: toOptions('AnoNeNeurceno'),
            dataClassifications: toOptions('KlasifikaceDat'),
            yesNo: toOptions('AnoNe'),
            criticalityClasses: toOptions('TridyKrit'),
            lifecycleStates: toOptions('StavAktiva'),
            reviewStates: toOptions('StavRevize'),
            ratingScale: toOptions('Skala15'),
        };
    }, [closedListsQuery.data]);

    const setField = (field: keyof FormFields, value: string) => {
        setFields((current) => ({ ...current, [field]: value }));
    };

    const validate = (): Partial<Record<keyof FormFields, string>> => {
        const nextErrors: Partial<Record<keyof FormFields, string>> = {};
        if (!fields.name.trim()) {
            nextErrors.name = t('form.errors.name_required');
        }
        return nextErrors;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const validationErrors = validate();
        setFieldErrors(validationErrors);
        const firstInvalid = REQUIRED_FIELDS.find((field) => validationErrors[field]);
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
            business_owner: fields.business_owner,
            owner_department: fields.owner_department,
            ict_owner: fields.ict_owner,
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
        });

        try {
            setIsSubmitting(true);
            setError(null);
            const saved = isEdit && initialData
                ? await assetApi.updateAsset(initialData.id, payload)
                : await assetApi.createAsset(payload);
            onSaved(saved);
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

            {closedListsQuery.isError ? (
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
                        onClick={() => void closedListsQuery.refetch()}
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
                    {selectField('asset_type', t('form.asset_type'), listOptions.assetTypes, 'asset-form-asset-type')}
                    {selectField('asset_level', t('form.asset_level'), listOptions.assetLevels, 'asset-form-asset-level')}
                    {selectField('deployment_model', t('form.deployment_model'), listOptions.deploymentModels, 'asset-form-deployment-model')}
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
                    {textField('business_owner', t('form.business_owner'), 'asset-form-business-owner')}
                    {selectField('owner_department', t('form.owner_department'), listOptions.departments, 'asset-form-owner-department')}
                    {textField('ict_owner', t('form.ict_owner'), 'asset-form-ict-owner')}
                    {selectField('gdpr_relevance', t('form.gdpr_relevance'), listOptions.yesNoUndetermined, 'asset-form-gdpr-relevance')}
                    {selectField('ai_relevance', t('form.ai_relevance'), listOptions.yesNoUndetermined, 'asset-form-ai-relevance')}
                    {selectField('data_classification', t('form.data_classification'), listOptions.dataClassifications, 'asset-form-data-classification')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ratings')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    {RATING_FIELDS.map((field) =>
                        selectField(field, t(`form.${field}`), listOptions.ratingScale, `asset-form-${field.replaceAll('_', '-')}`)
                    )}
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
                    {selectField('internet_exposed', t('form.internet_exposed'), listOptions.yesNo, 'asset-form-internet-exposed')}
                    {selectField('preliminary_criticality', t('form.preliminary_criticality'), listOptions.criticalityClasses, 'asset-form-preliminary-criticality')}
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.lifecycle')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    {selectField('lifecycle_state', t('form.lifecycle_state'), listOptions.lifecycleStates, 'asset-form-lifecycle-state')}
                    {textField('standard_support_end_date', t('form.standard_support_end_date'), 'asset-form-standard-support-end-date', { type: 'date' })}
                    {textField('extended_support_end_date', t('form.extended_support_end_date'), 'asset-form-extended-support-end-date', { type: 'date' })}
                    {textField('custom_support_end_date', t('form.custom_support_end_date'), 'asset-form-custom-support-end-date', { type: 'date' })}
                    {textField('last_legacy_risk_assessment_date', t('form.last_legacy_risk_assessment_date'), 'asset-form-last-legacy-risk-assessment-date', { type: 'date' })}
                    {selectField('review_state', t('form.review_state'), listOptions.reviewStates, 'asset-form-review-state')}
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
                    data-testid="asset-form-submit"
                    className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    <Save className={cn('h-4 w-4', isSubmitting && 'animate-pulse')} />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </button>
            </div>
        </form>
    );
}
