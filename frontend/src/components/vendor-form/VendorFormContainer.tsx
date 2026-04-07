import { useMemo, useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';

import { IMPACT_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import {
    VendorActionButton,
    VendorInlineMessage,
} from '@/components/vendors/vendorRouteUi';

import {
    filterSuggestions,
    getSubprocessSuggestions,
} from './vendorForm.mappers';
import { VendorClassificationSection } from './VendorClassificationSection';
import { VendorIdentitySection } from './VendorIdentitySection';
import { VendorOwnershipSection } from './VendorOwnershipSection';
import { VendorResilienceSection } from './VendorResilienceSection';
import { useVendorFormState } from './useVendorFormState';
import { useVendorLookups } from './useVendorLookups';
import { useVendorSubmit } from './useVendorSubmit';
import type { VendorFormProps } from './vendorForm.types';

export function VendorFormContainer({
    initialData,
    isEdit = false,
    onSaved,
    onCancel,
}: VendorFormProps) {
    const { t } = useTranslation('vendors');
    const { totalAssets } = useTotalAssetsValue();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lookups = useVendorLookups();
    const { formData, handleChange } = useVendorFormState({
        initialData,
        users: lookups.users,
    });
    const { handleSubmit } = useVendorSubmit({
        formData,
        initialData,
        isEdit,
        onSaved,
        setError,
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

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error ? (
                <VendorInlineMessage tone="danger">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </VendorInlineMessage>
            ) : null}

            <VendorIdentitySection formData={formData} onChange={handleChange} />
            <VendorOwnershipSection
                departmentOptions={lookups.departmentOptions}
                formData={formData}
                onChange={handleChange}
                ownerOptions={lookups.ownerOptions}
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

            <div className="flex items-center justify-end gap-3">
                {onCancel ? (
                    <VendorActionButton type="button" onClick={onCancel}>
                        <X className="h-4 w-4" />
                        {t('actions.cancel')}
                    </VendorActionButton>
                ) : null}
                <VendorActionButton type="submit" variant="primary" disabled={isSubmitting}>
                    <Save className={cn('h-4 w-4', isSubmitting && 'animate-pulse')} />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </VendorActionButton>
            </div>
        </form>
    );
}
