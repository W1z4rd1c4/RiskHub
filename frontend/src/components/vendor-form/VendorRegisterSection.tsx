import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
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
    listName?: string;
}

/** The entered 07_Dodavatelé register columns, grouped by workbook block. */
const REGISTER_BLOCKS: Array<{ titleKey: string; fields: RegisterFieldSpec[] }> = [
    {
        titleKey: 'form.register.blocks.identity',
        fields: [
            { field: 'latin_name', kind: 'text' },
            { field: 'person_type', kind: 'select', listName: 'TypOsoby' },
            { field: 'identifier_type', kind: 'select', listName: 'TypKodu' },
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
            { field: 'data_sensitivity', kind: 'select', listName: 'CitlivostDat' },
        ],
    },
    {
        titleKey: 'form.register.blocks.substitutability_exit',
        fields: [
            { field: 'substitutability_reason', kind: 'select', listName: 'DuvodSubst' },
            { field: 'last_audit_date', kind: 'date' },
            { field: 'exit_plan_state', kind: 'select', listName: 'ExitPlanStav' },
            { field: 'reintegration', kind: 'select', listName: 'Reintegrace' },
            { field: 'service_disruption_impact', kind: 'select', listName: 'DopadSluzby' },
            { field: 'alternative_providers', kind: 'select', listName: 'AltPosk' },
            { field: 'alternative_providers_names', kind: 'text' },
        ],
    },
    {
        titleKey: 'form.register.blocks.assessment',
        fields: [
            { field: 'ctpp_designation', kind: 'select', listName: 'AnoNeNeurceno' },
            { field: 'ex_ante_operational', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_legal', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_ict', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_reputational', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_data_confidentiality', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_data_availability', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_data_location', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_provider_location', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_ict_concentration', kind: 'select', listName: 'ExAnteHodn' },
            { field: 'ex_ante_assessment_date', kind: 'date' },
            { field: 'assessment_phase', kind: 'select', listName: 'Faze' },
            { field: 'due_diligence_state', kind: 'select', listName: 'DueDiligenceStav' },
            { field: 'last_monitoring_date', kind: 'date' },
            { field: 'significance_authorization_conditions', kind: 'select', listName: 'AnoNeNerel' },
            { field: 'significance_regulatory_requirements', kind: 'select', listName: 'AnoNeNerel' },
            { field: 'significance_service_quality', kind: 'select', listName: 'AnoNeNerel' },
            { field: 'significance_financial_impact', kind: 'select', listName: 'AnoNeNerel' },
            { field: 'significance_reputation_continuity', kind: 'select', listName: 'AnoNeNerel' },
            { field: 'significance_cumulative_impact', kind: 'select', listName: 'AnoNeNerel' },
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

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const optionsByList = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const byList: Record<string, Array<{ value: string; label: string }>> = {};
        for (const [name, values] of Object.entries(lists)) {
            byList[name] = values.map((value) => ({ value: String(value), label: String(value) }));
        }
        return byList;
    }, [closedListsQuery.data]);

    const fieldValue = (field: VendorFormField): string => {
        const value = formData[field];
        return value === null || value === undefined ? '' : String(value);
    };

    const renderField = ({ field, kind, listName }: RegisterFieldSpec) => {
        const label = t(`form.register.fields.${field}`);
        if (kind === 'select') {
            const canonicalOptions = optionsByList[listName ?? ''] ?? [];
            const current = fieldValue(field);
            const options =
                field === 'identifier_type' &&
                current &&
                !canonicalOptions.some((option) => option.value === current)
                    ? [{ value: current, label: current }, ...canonicalOptions]
                    : canonicalOptions;
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

            {closedListsQuery.isError ? (
                <div
                    role="status"
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200"
                >
                    <span>{t('form.register.lists_failed')}</span>
                    <button
                        type="button"
                        onClick={() => void closedListsQuery.refetch()}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-white/10"
                    >
                        {t('actions.refresh')}
                    </button>
                </div>
            ) : null}

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
