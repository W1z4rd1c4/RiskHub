import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { useAccountabilityReassignmentScenario } from '@/hooks/useAccountabilityReassignmentScenario';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { lookupApi } from '@/services/lookupApi';
import { threatApi } from '@/services/threatApi';
import { logError } from '@/services/logger';
import { isApprovalCreatedResponse, type ApprovalCreatedResponse } from '@/types/approval';
import type { Threat } from '@/types/threat';

import { FormActions, FormErrorSummary, FormLoadFailedNotice, FormSection } from '../shared/EntityFormChrome';
import { buildThreatWritePayload, THREAT_CATEGORY_CODES } from './threatsPagePresentation';

interface ThreatFormProps {
    initialData?: Threat;
    isEdit?: boolean;
    onSaved: (threat: Threat) => void;
    onApprovalQueued?: (response: ApprovalCreatedResponse) => void;
    onCancel?: () => void;
}

type FormFields = {
    name: string;
    threat_steward_user_id: string;
    category: string;
    description: string;
    typical_weaknesses: string;
    relevant_subject: string;
    notes: string;
    request_reason: string;
};

function toFieldValue(value: string | null | undefined): string {
    return value === null || value === undefined ? '' : value;
}

function initialFields(threat?: Threat): FormFields {
    return {
        name: toFieldValue(threat?.name),
        threat_steward_user_id: threat?.threat_steward_user_id?.toString() ?? '',
        category: toFieldValue(threat?.category),
        description: toFieldValue(threat?.description),
        typical_weaknesses: toFieldValue(threat?.typical_weaknesses),
        relevant_subject: toFieldValue(threat?.relevant_subject),
        notes: toFieldValue(threat?.notes),
        request_reason: '',
    };
}

function buildThreatFormPayload(fields: FormFields) {
    return {
        ...buildThreatWritePayload({
            name: fields.name,
            category: fields.category,
            description: fields.description,
            typical_weaknesses: fields.typical_weaknesses,
            relevant_subject: fields.relevant_subject,
            notes: fields.notes,
        }),
        threat_steward_user_id: Number(fields.threat_steward_user_id),
        ...(fields.request_reason.trim() ? { request_reason: fields.request_reason.trim() } : {}),
    };
}

export function ThreatForm({
    initialData,
    isEdit = false,
    onSaved,
    onApprovalQueued,
    onCancel,
}: ThreatFormProps) {
    const { t } = useTranslation('threats');
    const [fields, setFields] = useState<FormFields>(() => initialFields(initialData));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});
    const [stewardSearch, setStewardSearch] = useState('');
    const accountabilityScenario = useAccountabilityReassignmentScenario();
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({
        busy: isSubmitting,
        currentSnapshot: JSON.stringify(buildThreatFormPayload(fields)),
    });

    const stewardChanged = Boolean(
        isEdit
        && initialData
        && fields.threat_steward_user_id !== (initialData.threat_steward_user_id?.toString() ?? ''),
    );
    const stewardChangeRequiresApproval = accountabilityScenario.isEnabled && stewardChanged;
    const accountabilityScenarioUnavailable = stewardChanged
        && (accountabilityScenario.isLoading || accountabilityScenario.isError);
    let submitLabel = t('actions.create');
    if (stewardChangeRequiresApproval) {
        submitLabel = t('actions.submit_for_approval');
    } else if (isEdit) {
        submitLabel = t('actions.save');
    }

    // Required fields in DOM order — drives focus-first-invalid (N12).
    const requiredFields: Array<keyof FormFields> = [
        'name',
        'threat_steward_user_id',
        ...(stewardChangeRequiresApproval ? ['request_reason' as const] : []),
    ];
    const fieldRefs = useRef<Partial<Record<keyof FormFields, HTMLElement | null>>>({});
    const registerFieldRef = (field: keyof FormFields) => (element: HTMLElement | null) => {
        fieldRefs.current[field] = element;
    };

    const cisoQuery = useQuery({
        queryKey: ictRegisterKeys.threatStewardLookup(stewardSearch),
        queryFn: () => lookupApi.getThreatStewards({ q: stewardSearch || undefined, limit: 50 }),
        staleTime: 5 * 60_000,
    });

    const categoryOptions = useMemo(() => {
        return THREAT_CATEGORY_CODES.map((value) => ({
            value,
            label: t(`categories.${value}`),
        }));
    }, [t]);

    const stewardOptions = useMemo(() => (cisoQuery.data ?? []).map((user) => ({
        value: String(user.id),
        label: `${user.name} — ${user.email}`,
    })), [cisoQuery.data]);

    const setField = (field: keyof FormFields, value: string) => {
        setFields((current) => ({ ...current, [field]: value }));
        setFieldErrors((current) => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    };

    const validate = (): Partial<Record<keyof FormFields, string>> => {
        const nextErrors: Partial<Record<keyof FormFields, string>> = {};
        if (!fields.name.trim()) {
            nextErrors.name = t('form.errors.name_required');
        }
        if (!fields.threat_steward_user_id) {
            nextErrors.threat_steward_user_id = t('form.errors.steward_required');
        }
        if (stewardChangeRequiresApproval && !fields.request_reason.trim()) {
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

        const payload = buildThreatFormPayload(fields);

        try {
            setIsSubmitting(true);
            setError(null);
            const saved = isEdit && initialData
                ? await threatApi.updateThreat(initialData.id, payload)
                : await threatApi.createThreat(payload);
            acceptCurrentSnapshot();
            if (isApprovalCreatedResponse(saved)) {
                onApprovalQueued?.(saved);
            } else {
                onSaved(saved);
            }
        } catch (submitError) {
            logError('Failed to save threat:', submitError);
            setError(t('form.errors.save_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const textAreaField = (
        field: keyof FormFields,
        label: string,
        testId: string,
    ) => (
        <Field label={label} error={fieldErrors[field]}>
            {(control) => (
                <Textarea
                    {...control}
                    data-testid={testId}
                    value={fields[field]}
                    rows={3}
                    onChange={(event) => setField(field, event.target.value)}
                />
            )}
        </Field>
    );

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    return (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <fieldset disabled={isSubmitting} className="min-w-0 space-y-6 border-0 p-0">
            {error || hasFieldErrors ? (
                <FormErrorSummary message={error ?? t('form.errors.fix_fields')} />
            ) : null}

            {cisoQuery.isError ? (
                <FormLoadFailedNotice
                    message={t('form.errors.lists_failed')}
                    retryLabel={t('actions.retry')}
                    onRetry={() => void cisoQuery.refetch()}
                />
            ) : null}

            <FormSection title={t('form.sections.identity')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label={t('form.name')} required error={fieldErrors.name}>
                        {(control) => (
                            <Input
                                {...control}
                                ref={registerFieldRef('name')}
                                data-testid="threat-form-name"
                                value={fields.name}
                                required
                                onChange={(event) => setField('name', event.target.value)}
                            />
                        )}
                    </Field>
                    <Field label={t('form.category')}>
                        {(control) => (
                            <ThemedSelect
                                {...control}
                                value={fields.category}
                                onValueChange={(value) => setField('category', value)}
                                options={categoryOptions}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('form.not_set')}
                                triggerTestId="threat-form-category"
                            />
                        )}
                    </Field>
                    <Field
                        label={t('form.steward')}
                        required
                        error={fieldErrors.threat_steward_user_id}
                    >
                        {(control) => (
                            <SearchableEntitySelect
                                {...control}
                                value={fields.threat_steward_user_id}
                                onValueChange={(value) => setField('threat_steward_user_id', value)}
                                options={stewardOptions}
                                searchValue={stewardSearch}
                                onSearchChange={setStewardSearch}
                                placeholder={t('form.steward_placeholder')}
                                searchPlaceholder={t('form.steward_search')}
                                triggerTestId="threat-form-steward"
                                triggerRef={registerFieldRef('threat_steward_user_id')}
                            />
                        )}
                    </Field>
                    <Field label={t('form.relevant_subject')}>
                        {(control) => (
                            <Input
                                {...control}
                                data-testid="threat-form-relevant-subject"
                                value={fields.relevant_subject}
                                onChange={(event) => setField('relevant_subject', event.target.value)}
                            />
                        )}
                    </Field>
                </div>
            </FormSection>

            <FormSection title={t('form.sections.details')}>
                <div className="grid grid-cols-1 gap-5">
                    {textAreaField('description', t('form.description'), 'threat-form-description')}
                    {textAreaField('typical_weaknesses', t('form.typical_weaknesses'), 'threat-form-typical-weaknesses')}
                    {textAreaField('notes', t('form.notes'), 'threat-form-notes')}
                    <Field
                        label={t('form.request_reason')}
                        required={stewardChangeRequiresApproval}
                        error={fieldErrors.request_reason}
                        help={t('form.request_reason_help')}
                    >
                        {(control) => (
                            <Textarea
                                {...control}
                                ref={registerFieldRef('request_reason')}
                                data-testid="threat-form-request-reason"
                                value={fields.request_reason}
                                rows={3}
                                onChange={(event) => setField('request_reason', event.target.value)}
                            />
                        )}
                    </Field>
                </div>
            </FormSection>

            <FormActions
                submitLabel={submitLabel}
                submitTestId="threat-form-submit"
                isSubmitting={isSubmitting}
                submitDisabled={accountabilityScenarioUnavailable}
                onCancel={onCancel ? () => requestLocalLeave(onCancel) : undefined}
                cancelLabel={t('actions.cancel')}
                cancelTestId="threat-form-cancel"
            />
            </fieldset>
            {confirmationDialog}
        </form>
    );
}
