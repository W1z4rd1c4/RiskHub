import { useTranslation } from '@/i18n/hooks';
import { vendorValueOptions, type VendorControlledField } from '@/lib/vendorValues';
import { Field } from '@/components/ui/field';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';

import type { VendorFormData, VendorFormField } from './vendorForm.types';

interface VendorRegisterSectionProps {
    formData: VendorFormData;
    onChange: (field: VendorFormField, value: unknown) => void;
}

type RegisterFieldKind = 'text' | 'select' | 'date' | 'count' | 'textarea';

interface RegisterFieldSpec {
    field: VendorFormField;
    kind: RegisterFieldKind;
    controlledField?: VendorControlledField;
}

/** The entered 07_Dodavatelé register columns, grouped by workbook block. */
const REGISTER_BLOCKS: Array<{ titleKey: string; fields: RegisterFieldSpec[] }> = [
    {
        titleKey: 'form.register.blocks.identity',
        fields: [
            { field: 'latin_name', kind: 'text' },
            { field: 'person_type', kind: 'select', controlledField: 'person_type' },
            { field: 'identifier_type', kind: 'select', controlledField: 'identifier_type' },
            { field: 'identifier_value', kind: 'text' },
            { field: 'address', kind: 'text' },
            { field: 'contact_person', kind: 'text' },
            { field: 'contact', kind: 'text' },
            { field: 'ultimate_parent_name', kind: 'text' },
            { field: 'ultimate_parent_lei', kind: 'text' },
        ],
    },
    {
        titleKey: 'form.register.blocks.data_location',
        fields: [
            { field: 'data_storage', kind: 'text' },
            { field: 'service_country', kind: 'text' },
            { field: 'data_location', kind: 'text' },
            { field: 'processing_location', kind: 'text' },
            { field: 'data_sensitivity', kind: 'select', controlledField: 'data_sensitivity' },
        ],
    },
    {
        titleKey: 'form.register.blocks.substitutability_exit',
        fields: [
            { field: 'substitutability_reason', kind: 'select', controlledField: 'substitutability_reason' },
            { field: 'last_audit_date', kind: 'date' },
            { field: 'exit_plan_state', kind: 'select', controlledField: 'exit_plan_state' },
            { field: 'reintegration', kind: 'select', controlledField: 'reintegration' },
            { field: 'service_disruption_impact', kind: 'select', controlledField: 'service_disruption_impact' },
            { field: 'alternative_providers', kind: 'select', controlledField: 'alternative_providers' },
            { field: 'alternative_providers_names', kind: 'text' },
        ],
    },
    {
        titleKey: 'form.register.blocks.assessment',
        fields: [
            { field: 'ctpp_designation', kind: 'select', controlledField: 'ctpp_designation' },
            { field: 'ex_ante_operational', kind: 'select', controlledField: 'ex_ante_operational' },
            { field: 'ex_ante_legal', kind: 'select', controlledField: 'ex_ante_legal' },
            { field: 'ex_ante_ict', kind: 'select', controlledField: 'ex_ante_ict' },
            { field: 'ex_ante_reputational', kind: 'select', controlledField: 'ex_ante_reputational' },
            { field: 'ex_ante_data_confidentiality', kind: 'select', controlledField: 'ex_ante_data_confidentiality' },
            { field: 'ex_ante_data_availability', kind: 'select', controlledField: 'ex_ante_data_availability' },
            { field: 'ex_ante_data_location', kind: 'select', controlledField: 'ex_ante_data_location' },
            { field: 'ex_ante_provider_location', kind: 'select', controlledField: 'ex_ante_provider_location' },
            { field: 'ex_ante_ict_concentration', kind: 'select', controlledField: 'ex_ante_ict_concentration' },
            { field: 'ex_ante_assessment_date', kind: 'date' },
            { field: 'assessment_phase', kind: 'select', controlledField: 'assessment_phase' },
            { field: 'due_diligence_state', kind: 'select', controlledField: 'due_diligence_state' },
            { field: 'last_monitoring_date', kind: 'date' },
            { field: 'significance_authorization_conditions', kind: 'select', controlledField: 'significance_authorization_conditions' },
            { field: 'significance_regulatory_requirements', kind: 'select', controlledField: 'significance_regulatory_requirements' },
            { field: 'significance_service_quality', kind: 'select', controlledField: 'significance_service_quality' },
            { field: 'significance_financial_impact', kind: 'select', controlledField: 'significance_financial_impact' },
            { field: 'significance_reputation_continuity', kind: 'select', controlledField: 'significance_reputation_continuity' },
            { field: 'significance_cumulative_impact', kind: 'select', controlledField: 'significance_cumulative_impact' },
            { field: 'significance_justification', kind: 'textarea' },
        ],
    },
    {
        titleKey: 'form.register.blocks.status_notes',
        fields: [
            { field: 'note', kind: 'textarea' },
            { field: 'reference_occurrence_count', kind: 'count' },
            { field: 'reference_process_count', kind: 'count' },
        ],
    },
];

export function VendorRegisterSection({ formData, onChange }: VendorRegisterSectionProps) {
    const { t } = useTranslation('vendors');

    const fieldValue = (field: VendorFormField): string => {
        const value = formData[field];
        return value === null || value === undefined ? '' : String(value);
    };

    const renderField = ({ field, kind, controlledField }: RegisterFieldSpec) => {
        const label = t(`form.register.fields.${field}`);
        if (kind === 'select') {
            const options = controlledField ? vendorValueOptions(t, controlledField) : [];
            return (
                <Field
                    key={field}
                    label={label}
                    labelClassName="vendor-label"
                    className="vendor-field space-y-0"
                >
                    {(control) => (
                        <ThemedSelect
                            {...control}
                            value={fieldValue(field)}
                            onValueChange={(value) => onChange(field, value || null)}
                            options={options}
                            allowEmpty
                            emptyLabel={t('form.register.not_set')}
                            placeholder={t('form.register.not_set')}
                            triggerTestId={`vendor-register-${field}`}
                        />
                    )}
                </Field>
            );
        }
        if (kind === 'textarea') {
            return (
                <Field
                    key={field}
                    label={label}
                    labelClassName="vendor-label"
                    className="vendor-field space-y-0 md:col-span-2"
                >
                    {(control) => (
                        <textarea
                            {...control}
                            data-testid={`vendor-register-${field}`}
                            value={fieldValue(field)}
                            onChange={(event) => onChange(field, event.target.value)}
                            rows={2}
                            className="vendor-textarea"
                        />
                    )}
                </Field>
            );
        }
        return (
            <Field
                key={field}
                label={label}
                labelClassName="vendor-label"
                className="vendor-field space-y-0"
            >
                {(control) => (
                    <input
                        {...control}
                        type={kind === 'date' ? 'date' : kind === 'count' ? 'number' : 'text'}
                        min={kind === 'count' ? 0 : undefined}
                        data-testid={`vendor-register-${field}`}
                        value={fieldValue(field)}
                        onChange={(event) => {
                            if (kind === 'count') {
                                const parsed = Number.parseInt(event.target.value, 10);
                                onChange(field, Number.isFinite(parsed) ? parsed : null);
                                return;
                            }
                            onChange(field, event.target.value);
                        }}
                        className="vendor-input"
                    />
                )}
            </Field>
        );
    };

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader title={t('form.sections.register')} />

            {REGISTER_BLOCKS.map((block) => (
                <div className="space-y-3" key={block.titleKey}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t(block.titleKey)}
                    </p>
                    <div className="vendor-form-grid">{block.fields.map(renderField)}</div>
                </div>
            ))}
        </VendorSurface>
    );
}
