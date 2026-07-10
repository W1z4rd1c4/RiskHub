import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

import type { VendorFormField } from './vendorForm.types';
import { LEGACY_REPLACEABILITY_LABEL_KEYS } from './vendorForm.types';

interface VendorResilienceSectionProps {
    formData: {
        has_alternative_providers?: boolean;
        replaceability?: string | null;
    };
    onChange: (field: VendorFormField, value: unknown) => void;
}

export function VendorResilienceSection({ formData, onChange }: VendorResilienceSectionProps) {
    const { t } = useTranslation('vendors');

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    // Substitutability choices come from the workbook's closed four-value
    // Substituce list; a legacy stored value (easy/medium/hard) stays visible
    // as the current selection but is not offered as a new choice.
    const substitutabilityOptions = useMemo(() => {
        const values = (closedListsQuery.data?.['Substituce'] ?? []).map(String);
        const options = values.map((value) => ({ value, label: value }));
        const current = formData.replaceability;
        if (current && !values.includes(current)) {
            options.unshift({
                value: current,
                label: t(LEGACY_REPLACEABILITY_LABEL_KEYS[current] ?? current, current),
            });
        }
        return options;
    }, [closedListsQuery.data, formData.replaceability, t]);

    return (
        <VendorSurface className="space-y-5">
            <VendorSectionHeader title={t('form.sections.resilience')} />

            <div className="vendor-form-grid">
                <div className="vendor-field">
                    <label className="vendor-label">{t('form.replaceability.label')}</label>
                    <ThemedSelect
                        value={formData.replaceability ? String(formData.replaceability) : ''}
                        onValueChange={(value) => onChange('replaceability', value || null)}
                        placeholder={t('form.replaceability.placeholder')}
                        allowEmpty
                        emptyLabel={t('form.replaceability.placeholder')}
                        options={substitutabilityOptions}
                    />
                </div>
                <div className="vendor-field md:col-span-2">
                    <label className="vendor-label">{t('flags.has_alternatives')}</label>
                    <label className="vendor-checkbox">
                        <input
                            type="checkbox"
                            checked={!!formData.has_alternative_providers}
                            onChange={(event) => onChange('has_alternative_providers', event.target.checked)}
                            className="accent-accent"
                        />
                        {t('flags.has_alternatives')}
                    </label>
                </div>
            </div>
        </VendorSurface>
    );
}
