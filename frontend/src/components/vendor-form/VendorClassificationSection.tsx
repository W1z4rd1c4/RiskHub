import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';

import type { VendorFormField } from './vendorForm.types';
import { ordinalSeverityBand, severityClass } from '@/lib/severity';

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
    const band = ordinalSeverityBand(score);
    const hasFlags = Boolean(
        formData.supports_important_core_insurance_function
        || formData.dora_relevant
        || formData.is_significant_vendor,
    );

    const renderFlagCheckbox = (key: ClassificationFlagKey, label: string) => (
        <Field key={key} label={label} layout="inline">
            {(control) => (
                <Checkbox
                    {...control}
                    checked={!!formData[key]}
                    onCheckedChange={(checked) => onChange(key, checked)}
                />
            )}
        </Field>
    );

    return (
        <Card as="section">
            <CardHeader title={t('form.sections.classification')} />

            <div className="space-y-5">
                <Field
                    label={t('form.risk_score')}
                    help={(
                        <>
                            <span className="font-semibold text-foreground">{impactLabel}</span>
                            {financialRange ? ` • ${financialRange}` : null}
                        </>
                    )}
                >
                    {(control) => (
                        <div className="flex items-center gap-3">
                            <input
                                {...control}
                                type="range"
                                min={1}
                                max={5}
                                value={score}
                                aria-valuetext={`${score} / 5`}
                                onChange={(event) => onChange('risk_score_1_5', Number(event.target.value))}
                                className={cn('w-full', severityClass('slider', band))}
                            />
                            <SeverityBadge band={band} label={`${score} / 5`} aria-hidden="true" />
                        </div>
                    )}
                </Field>

                <fieldset className="min-w-0 space-y-3 border-0 p-0">
                    <legend className="text-eyebrow">{t('form.flags')}</legend>
                    {hasFlags ? (
                        <div className="flex flex-wrap gap-2">
                            {formData.supports_important_core_insurance_function ? (
                                <Badge tone="success">{t('flags.supports_core_function')}</Badge>
                            ) : null}
                            {formData.dora_relevant ? (
                                <Badge tone="info">{t('flags.dora_relevant')}</Badge>
                            ) : null}
                            {formData.is_significant_vendor ? (
                                <Badge tone="warning">{t('flags.significant_vendor')}</Badge>
                            ) : null}
                        </div>
                    ) : null}
                    {renderFlagCheckbox(
                        'supports_important_core_insurance_function',
                        t('flags.supports_core_function'),
                    )}
                    {renderFlagCheckbox('dora_relevant', t('flags.dora_relevant'))}
                    {renderFlagCheckbox('is_significant_vendor', t('flags.significant_vendor'))}
                </fieldset>
            </div>
        </Card>
    );
}
