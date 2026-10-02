import { useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { InlineMessage } from '@/components/ui/inline-message';
import { Textarea } from '@/components/ui/textarea';
import { IMPACT_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { useAccountabilityReassignmentScenario } from '@/hooks/useAccountabilityReassignmentScenario';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';

import {
    buildVendorPayload,
    filterSuggestions,
    getSubprocessSuggestions,
    vendorOwnerChangeRequiresApproval,
    withCurrentDepartmentOption,
    withCurrentOwnerOption,
} from './vendorForm.mappers';
import { VendorClassificationSection } from './VendorClassificationSection';
import { VendorIdentitySection } from './VendorIdentitySection';
import { VendorOwnershipSection } from './VendorOwnershipSection';
import { VendorRegisterSection } from './VendorRegisterSection';
import { VendorResilienceSection } from './VendorResilienceSection';
import { useVendorFormState } from './useVendorFormState';
import { useVendorLookups } from './useVendorLookups';
import { useVendorSubmit } from './useVendorSubmit';
import type { VendorFormField, VendorFormProps } from './vendorForm.types';

function focusVendorValidationField(field: VendorFormField | 'request_reason') {
    const testIdByField: Partial<Record<typeof field, string>> = {
        name: 'vendor-form-name',
        process: 'vendor-form-process',
        department_id: 'vendor-form-department',
        outsourcing_owner_user_id: 'vendor-form-owner',
        request_reason: 'vendor-form-request-reason',
    };
    const testId = testIdByField[field];
    if (testId) {
        requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus();
        });
    }
}

export function VendorFormContainer({
    initialData,
    isEdit = false,
    onSaved,
    onApprovalQueued,
    onCancel,
}: VendorFormProps) {
    const { t } = useTranslation('vendors');
    const { totalAssets } = useTotalAssetsValue();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requestReason, setRequestReason] = useState('');
    const [requestReasonError, setRequestReasonError] = useState<string | null>(null);
    // The required field the last validation failed on: its `Field` repeats the
    // form-top message (§4.16: field error + one form-top InlineMessage).
    const [invalidField, setInvalidField] = useState<VendorFormField | null>(null);
    const accountabilityScenario = useAccountabilityReassignmentScenario();
    const canManageAccountability = !isEdit
        || resolveCapabilityFlag(initialData?.capabilities, 'can_manage_accountability');

    const lookups = useVendorLookups({ accountabilityEnabled: canManageAccountability });
    const { formData, handleChange: applyChange } = useVendorFormState({
        initialData,
        users: lookups.users,
    });
    const handleChange = (field: VendorFormField, value: unknown) => {
        if (field === invalidField) setInvalidField(null);
        applyChange(field, value);
    };
    // A required field filled indirectly (the owner autofills the department) stops showing the error.
    const fieldError = (field: VendorFormField) => {
        const value = formData[field];
        const isBlank = value === undefined || value === null || value === 0 || String(value).trim() === '';
        return invalidField === field && isBlank ? error : null;
    };
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({
        busy: isSubmitting,
        currentSnapshot: JSON.stringify([
            buildVendorPayload(formData),
            requestReason.trim(),
        ]),
    });
    const accountabilityChanged = Boolean(
        isEdit
        && initialData
        && formData.outsourcing_owner_user_id !== initialData.outsourcing_owner_user_id,
    );
    const requestReasonRequired = vendorOwnerChangeRequiresApproval(
        initialData,
        accountabilityChanged,
        accountabilityScenario,
    );
    const accountabilityScenarioUnavailable = accountabilityChanged
        && (accountabilityScenario.isLoading || accountabilityScenario.isError);
    let submitLabel = t('actions.create');
    if (requestReasonRequired) {
        submitLabel = t('actions.submit_for_approval');
    } else if (isEdit) {
        submitLabel = t('actions.save');
    }
    const { handleSubmit } = useVendorSubmit({
        formData,
        initialData,
        isEdit,
        onSaved,
        onApprovalQueued,
        requestReason,
        requestReasonRequired,
        onAccepted: acceptCurrentSnapshot,
        onValidationError: (field) => {
            setInvalidField(field === 'request_reason' ? null : field);
            focusVendorValidationField(field);
        },
        setError,
        setRequestReasonError,
        setIsSubmitting,
        t,
    });

    const score = formData.risk_score_1_5 || 3;
    const impact = IMPACT_DESCRIPTIONS[score as 1 | 2 | 3 | 4 | 5];
    const impactLabel = impact ? t(impact.labelKey, impact.labelKey) : '';
    const financialRange = formatFinancialRange(score, totalAssets, t('form.financial.no_loss'));

    const processSuggestions = useMemo(
        () => filterSuggestions(lookups.existingProcesses, formData.process),
        [formData.process, lookups.existingProcesses],
    );
    const subprocessSuggestions = useMemo(
        () => getSubprocessSuggestions(lookups.subprocessesByProcess, formData.process, formData.subprocess),
        [formData.process, formData.subprocess, lookups.subprocessesByProcess],
    );
    const ownerOptions = useMemo(
        () => withCurrentOwnerOption(lookups.ownerOptions, initialData),
        [initialData, lookups.ownerOptions],
    );
    const departmentOptions = useMemo(
        () => withCurrentDepartmentOption(lookups.departmentOptions, initialData),
        [initialData, lookups.departmentOptions],
    );

    return (
        <form
            onSubmit={accountabilityScenarioUnavailable
                ? (event) => event.preventDefault()
                : handleSubmit}
            className="space-y-6"
        >
            <fieldset disabled={isSubmitting} className="min-w-0 space-y-6 border-0 p-0">
            {error ? <InlineMessage tone="danger">{error}</InlineMessage> : null}

            {lookups.isOwnerLookupError ? (
                <InlineMessage
                    tone="warning"
                    action={(
                        <Button type="button" variant="outline" size="compact" onClick={() => void lookups.refetchOwners()}>
                            {t('actions.refresh')}
                        </Button>
                    )}
                >
                    {t('errors.owner_lookup_failed')}
                </InlineMessage>
            ) : null}

            <VendorIdentitySection formData={formData} onChange={handleChange} nameError={fieldError('name')} />
            <VendorOwnershipSection
                canManageAccountability={canManageAccountability}
                departmentOptions={departmentOptions}
                formData={formData}
                onChange={handleChange}
                ownerOptions={ownerOptions}
                ownerSearch={lookups.ownerSearch}
                onOwnerSearchChange={lookups.setOwnerSearch}
                processSuggestions={processSuggestions}
                subprocessSuggestions={subprocessSuggestions}
                errors={{
                    department_id: fieldError('department_id'),
                    outsourcing_owner_user_id: fieldError('outsourcing_owner_user_id'),
                    process: fieldError('process'),
                }}
            />
            <VendorClassificationSection
                financialRange={financialRange}
                formData={formData}
                impactLabel={impactLabel}
                onChange={handleChange}
            />
            <VendorResilienceSection formData={formData} onChange={handleChange} />
            <VendorRegisterSection formData={formData} onChange={handleChange} />

            <Field
                label={t('form.request_reason')}
                required={requestReasonRequired}
                error={requestReasonError}
                help={t('form.request_reason_help')}
            >
                {(control) => (
                    <Textarea
                        {...control}
                        data-testid="vendor-form-request-reason"
                        className="min-h-24"
                        value={requestReason}
                        onChange={(event) => {
                            setRequestReason(event.target.value);
                            setRequestReasonError(null);
                        }}
                        placeholder={t('form.request_reason_help')}
                    />
                )}
            </Field>

            <div className="flex items-center justify-end gap-3">
                {onCancel ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => requestLocalLeave(onCancel)}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        {t('actions.cancel')}
                    </Button>
                ) : null}
                <Button
                    type="submit"
                    variant="accent"
                    disabled={isSubmitting || accountabilityScenarioUnavailable}
                    isLoading={isSubmitting}
                >
                    {!isSubmitting ? <Save className="h-4 w-4" aria-hidden="true" /> : null}
                    {submitLabel}
                </Button>
            </div>
            </fieldset>
            {confirmationDialog}
        </form>
    );
}
