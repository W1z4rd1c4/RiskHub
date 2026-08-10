import { Cpu } from 'lucide-react';

import { CriticalityClassPill, VendorTierPill } from '@/components/ict-register/CriticalityClassPill';
import { useTranslation } from '@/i18n/hooks';
import { vendorValueLabel } from '@/lib/vendorValues';
import type { VendorDerived } from '@/types/vendor';

/**
 * The Vendor's engine-derived ICT Register block (issue #49), read-only:
 * tier, two-path CIF + chain propagation, max linked-asset criticality,
 * chain level, significance outcome, completeness, the main-contract
 * lookups, the derived-only transitive Process links (11 §2), and the
 * explain inputs behind it all. Values arrive computed on read — nothing
 * here is editable, mirroring the workbook's locked formula cells.
 */

function Field({
    label,
    value,
    testId,
}: {
    label: string;
    value: string | number | null | undefined;
    testId?: string;
}) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-sm text-white" data-testid={testId}>
                {value === null || value === undefined || value === '' ? '—' : value}
            </p>
        </div>
    );
}

function PillField({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            {children}
        </div>
    );
}

export function VendorDerivedSection({ derived }: { derived: VendorDerived }) {
    const { t } = useTranslation('vendors');

    const completeness = derived.is_complete ? t('derived.complete') : t('derived.incomplete');
    const boolLabel = (value: boolean) =>
        value ? t('derived.inputs.yes') : t('derived.inputs.no');

    return (
        <div className="glass-card space-y-5" data-testid="vendor-derived-section">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                    <Cpu className="h-5 w-5 text-accent" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                        {t('derived.title')}
                    </h2>
                </div>
                <VendorTierPill
                    tier={derived.tier}
                    displayValue={vendorValueLabel(t, 'tier', derived.tier)}
                    testId="vendor-derived-tier"
                />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <Field label={t('derived.cif')} value={vendorValueLabel(t, 'cif', derived.cif)} testId="vendor-derived-cif" />
                <Field
                    label={t('derived.cif_chain')}
                    value={vendorValueLabel(t, 'cif_chain', derived.cif_chain)}
                    testId="vendor-derived-cif-chain"
                />
                <PillField label={t('derived.max_criticality')}>
                    <CriticalityClassPill
                        criticalityClass={derived.max_criticality}
                        displayValue={vendorValueLabel(t, 'max_criticality', derived.max_criticality)}
                    />
                </PillField>
                <Field label={t('derived.country_category')} value={vendorValueLabel(t, 'country_category', derived.country_category)} />
                <Field label={t('derived.chain_level')} value={vendorValueLabel(t, 'chain_level', derived.chain_level)} />
                <Field
                    label={t('derived.significance_outcome')}
                    value={vendorValueLabel(t, 'significance_outcome', derived.significance_outcome)}
                />
                <Field
                    label={t('derived.completeness')}
                    value={completeness}
                    testId="vendor-derived-completeness"
                />
                <Field label={t('derived.main_contract_reference')} value={derived.main_contract_reference} />
                <Field label={t('derived.linked_asset_count')} value={derived.linked_asset_count} />
                <Field label={t('derived.linked_process_count')} value={derived.linked_process_count} />
                <Field label={t('derived.cif_process_count')} value={derived.cif_process_count} />
                <Field label={t('derived.contract_count')} value={derived.contract_count} />
                <Field label={t('derived.main_contract_count')} value={derived.main_contract_count} />
                <Field
                    label={t('derived.direct_sub_providers')}
                    value={
                        derived.direct_sub_provider_names.length
                            ? derived.direct_sub_provider_names.join('; ')
                            : derived.direct_sub_provider_count || t('derived.inputs.none')
                    }
                />
            </div>

            <div className="space-y-3 border-t border-white/5 pt-4" data-testid="vendor-derived-transitive">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                    {t('derived.transitive.title')}
                </h3>
                {derived.transitive_process_links.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('derived.transitive.empty')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <th className="py-2 pr-4">{t('derived.transitive.process')}</th>
                                    <th className="py-2 pr-4">{t('derived.transitive.process_cif')}</th>
                                    <th className="py-2 pr-4">{t('derived.transitive.process_criticality')}</th>
                                    <th className="py-2">{t('derived.transitive.via_asset')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {derived.transitive_process_links.map((link, index) => (
                                    <tr
                                        key={`${link.process_id}-${link.via_asset_id}-${index}`}
                                        className="border-t border-white/5 text-sm"
                                        data-testid={`vendor-derived-transitive-row-${index}`}
                                    >
                                        <td className="py-2 pr-4 font-medium text-white">{link.process_name}</td>
                                        <td className="py-2 pr-4 text-slate-300">{vendorValueLabel(t, 'cif', link.process_cif)}</td>
                                        <td className="py-2 pr-4">
                                            <CriticalityClassPill
                                                criticalityClass={link.process_criticality}
                                                displayValue={vendorValueLabel(t, 'max_criticality', link.process_criticality)}
                                            />
                                        </td>
                                        <td className="py-2 text-slate-300">{link.via_asset_name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="space-y-4 border-t border-white/5 pt-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                    {t('derived.inputs.title')}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <Field
                        label={t('derived.inputs.cif_asset_link_count')}
                        value={derived.inputs.cif_asset_link_count}
                    />
                    <Field
                        label={t('derived.inputs.cif_process_link_count')}
                        value={derived.inputs.cif_process_link_count}
                    />
                    <Field
                        label={t('derived.inputs.cloud_service_link_count')}
                        value={derived.inputs.cloud_service_link_count}
                    />
                    <Field
                        label={t('derived.inputs.substitutability')}
                        value={vendorValueLabel(t, 'replaceability', derived.inputs.substitutability)}
                    />
                    <Field
                        label={t('derived.inputs.tier_max_rank_at_least_high')}
                        value={boolLabel(derived.inputs.tier_max_rank_at_least_high)}
                    />
                    <Field
                        label={t('derived.inputs.tier_substitutability_match')}
                        value={boolLabel(derived.inputs.tier_substitutability_match)}
                    />
                    <Field
                        label={t('derived.inputs.manual_process_link_count')}
                        value={derived.inputs.manual_process_link_count}
                    />
                    <Field
                        label={t('derived.inputs.transitive_process_pair_count')}
                        value={derived.inputs.transitive_process_pair_count}
                    />
                    <Field
                        label={t('derived.inputs.missing')}
                        value={
                            derived.inputs.missing_for_completeness.length
                                ? derived.inputs.missing_for_completeness.join(', ')
                                : t('derived.inputs.none')
                        }
                        testId="vendor-derived-missing"
                    />
                </div>
            </div>
        </div>
    );
}
