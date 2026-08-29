import { useMemo, useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { IMPACT_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { useAccountabilityReassignmentScenario } from '@/hooks/useAccountabilityReassignmentScenario';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Vendor } from '@/types/vendor';
import {
    VendorInlineMessage,
} from '@/components/vendors/vendorRouteUi';

import {
    filterSuggestions,
    getSubprocessSuggestions,
} from './vendorForm.mappers';
import { VendorClassificationSection } from './VendorClassificationSection';
import { VendorIdentitySection } from './VendorIdentitySection';
import { VendorOwnershipSection } from './VendorOwnershipSection';
import { VendorRegisterSection } from './VendorRegisterSection';
import { VendorResilienceSection } from './VendorResilienceSection';
import { useVendorFormState } from './useVendorFormState';
import { useVendorLookups } from './useVendorLookups';
import { useVendorSubmit } from './useVendorSubmit';
import type { VendorFormProps } from './vendorForm.types';

function vendorOwnerChangeRequiresApproval(
    vendor: Vendor | undefined,
    accountabilityChanged: boolean,
    scenario: ReturnType<typeof useAccountabilityReassignmentScenario>,
): boolean {
    if (!accountabilityChanged) return false;
    if (scenario.isEnabled) return true;
    if (!scenario.requiresApproval('protected_vendor_edit')) return false;
    return (
        vendor?.derived?.tier === 'critical'
        || vendor?.derived?.tier === 'significant'
        || resolveCapabilityFlag(
            vendor?.capabilities,
            'protected_change_requires_approval',
        )
    );
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
    const accountabilityScenario = useAccountabilityReassignmentScenario();
    const canManageAccountability = !isEdit
        || resolveCapabilityFlag(initialData?.capabilities, 'can_manage_accountability');

    const lookups = useVendorLookups({ accountabilityEnabled: canManageAccountability });
    const { formData, handleChange } = useVendorFormState({
        initialData,
        users: lookups.users,
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
        onValidationError: (field) => {
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
    const ownerOptions = useMemo(() => {
        const options = [...lookups.ownerOptions];
        if (
            initialData?.outsourcing_owner_user_id
            && initialData.outsourcing_owner
            && !options.some((option) => option.value === String(initialData.outsourcing_owner_user_id))
        ) {
            options.push({
                value: String(initialData.outsourcing_owner_user_id),
                label: [
                    `${initialData.outsourcing_owner.name} — ${initialData.outsourcing_owner.email}`,
                    initialData.outsourcing_owner.department_name,
                    initialData.outsourcing_owner.role_name,
                ].filter(Boolean).join(' · '),
            });
        }
        return options;
    }, [initialData, lookups.ownerOptions]);
    const departmentOptions = useMemo(() => {
        const options = [...lookups.departmentOptions];
        if (
            initialData?.department_id
            && initialData.department_name
            && !options.some((option) => option.value === String(initialData.department_id))
        ) {
            options.push({ value: String(initialData.department_id), label: initialData.department_name });
        }
        return options;
    }, [initialData, lookups.departmentOptions]);

    return (
        <form
            onSubmit={accountabilityScenarioUnavailable
                ? (event) => event.preventDefault()
                : handleSubmit}
            className="space-y-6"
        >
            {error ? (
                <VendorInlineMessage tone="danger">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </VendorInlineMessage>
            ) : null}

            {lookups.isOwnerLookupError ? (
                <VendorInlineMessage tone="warn">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="flex flex-1 items-center justify-between gap-3">
                        <p className="text-sm font-medium">{t('errors.owner_lookup_failed')}</p>
                        <button type="button" onClick={() => void lookups.refetchOwners()} className="text-xs font-black uppercase tracking-widest">
                            {t('actions.refresh')}
                        </button>
                    </div>
                </VendorInlineMessage>
            ) : null}

            <VendorIdentitySection formData={formData} onChange={handleChange} />
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
                labelClassName="vendor-label"
                className="vendor-field space-y-0"
            >
                {(control) => (
                    <textarea
                        {...control}
                        data-testid="vendor-form-request-reason"
                        className="vendor-input min-h-24"
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
                    <Button type="button" variant="outline" onClick={onCancel}>
                        <X className="h-4 w-4" aria-hidden="true" />
                        {t('actions.cancel')}
                    </Button>
                ) : null}
                <Button
                    type="submit"
                    disabled={isSubmitting || accountabilityScenarioUnavailable}
                    isLoading={isSubmitting}
                    className="bg-accent text-accent-foreground hover:bg-accent-hover hover:text-accent-foreground"
                >
                    {!isSubmitting ? <Save className="h-4 w-4" aria-hidden="true" /> : null}
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}
