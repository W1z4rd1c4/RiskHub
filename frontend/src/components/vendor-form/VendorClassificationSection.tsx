import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import {
    VendorBadge,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

import { scoreColor } from './vendorForm.mappers';
import type { VendorFormField } from './vendorForm.types';

type ClassificationFlagKey =
    | 'supports_important_core_insurance_function'
    | 'dora_relevant'
    | 'is_significant_vendor';

interface VendorClassificationSectionProps {
    financialRange: string;
    formData: {
        dora_relevant?: boolean;
        is_significant_vendor?: boolean;
        risk_score_1_5?: number;
        supports_important_core_insurance_function?: boolean;
    };
    impactLabel: string;
    onChange: (field: VendorFormField, value: unknown) => void;
}

export function VendorClassificationSection({
    financialRange,
    formData,
    impactLabel,
    onChange,
}: VendorClassificationSectionProps) {
    const { t } = useTranslation('vendors');
    const score = formData.risk_score_1_5 || 3;

    const renderFlagCheckbox = (key: ClassificationFlagKey, label: string) => (
        <label key={key} className="vendor-checkbox">
            <input
                type="checkbox"
                checked={!!formData[key]}
                onChange={(event) => onChange(key, event.target.checked)}
                className="accent-accent"
            />
            {label}
        </label>
    );

    return (
        <VendorSurface className="space-y-5">
            <VendorSectionHeader title={t('form.sections.classification')} />

            <div className="space-y-5">
                <div className="vendor-field">
                    <label className="vendor-label">{t('form.risk_score')}</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={1}
                            max={5}
                            value={score}
                            onChange={(event) => onChange('risk_score_1_5', Number(event.target.value))}
                            className={cn(
                                'w-full',
                                score >= 5
                                    ? 'accent-rose-500'
                                    : score >= 4
                                        ? 'accent-orange-500'
                                        : score >= 3
                                            ? 'accent-amber-500'
                                            : score >= 2
                                                ? 'accent-blue-500'
                                                : 'accent-emerald-500',
                            )}
                        />
                        <div
                            className={cn(
                                'px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap',
                                scoreColor(score),
                            )}
                        >
                            {score} / 5
                        </div>
                    </div>
                    <p className="text-xs vendor-muted">
                        <span className="font-semibold vendor-text">{impactLabel}</span>
                        {financialRange ? ` • ${financialRange}` : null}
                    </p>
                </div>

                <div className="vendor-form-grid">
                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.flags')}</label>
                        <div className="flex flex-wrap gap-2">
                            {formData.supports_important_core_insurance_function ? (
                                <VendorBadge tone="success">{t('flags.supports_core_function')}</VendorBadge>
                            ) : null}
                            {formData.dora_relevant ? (
                                <VendorBadge tone="info">{t('flags.dora_relevant')}</VendorBadge>
                            ) : null}
                            {formData.is_significant_vendor ? (
                                <VendorBadge tone="warn">{t('flags.significant_vendor')}</VendorBadge>
                            ) : null}
                        </div>
                    </div>

                    <div className="vendor-field md:col-span-2">
                        <div className="vendor-checkbox-list">
                            {renderFlagCheckbox(
                                'supports_important_core_insurance_function',
                                t('flags.supports_core_function'),
                            )}
                            {renderFlagCheckbox('dora_relevant', t('flags.dora_relevant'))}
                            {renderFlagCheckbox('is_significant_vendor', t('flags.significant_vendor'))}
                        </div>
                    </div>
                </div>
            </div>
        </VendorSurface>
    );
}
