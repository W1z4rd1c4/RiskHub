import { Cpu } from 'lucide-react';

import { CriticalityClassPill, VendorTierPill } from '@/components/ict-register/CriticalityClassPill';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useTranslation } from '@/i18n/hooks';
import { humanizeCode } from '@/lib/humanizeCode';
import { vendorValueLabel } from '@/lib/vendorValues';
import type { VendorDerived } from '@/types/vendor';

import { DetailField, DetailFieldList } from '../detail/DetailField';
import { DetailSection } from '../detail/DetailSection';

/**
 * The Vendor's engine-derived ICT Register block (issue #49), read-only:
 * tier, two-path CIF + chain propagation, max linked-asset criticality,
 * chain level, significance outcome, completeness, the main-contract
 * lookups, the derived-only transitive Process links (11 §2), and the
 * explain inputs behind it all. Values arrive computed on read — nothing
 * here is editable, mirroring the workbook's locked formula cells.
 */
export function VendorDerivedSection({ derived }: { derived: VendorDerived }) {
    const { t } = useTranslation('vendors');

    const completeness = derived.is_complete ? t('derived.complete') : t('derived.incomplete');
    const boolLabel = (value: boolean) =>
        value ? t('derived.inputs.yes') : t('derived.inputs.no');
    // GAP-D-02: the engine reports missing fields by column code; show the
    // field's form label (register block, then derived block), never snake_case.
    const missingFieldLabel = (code: string) => t(`form.register.fields.${code}`, {
        defaultValue: t(`derived.${code}`, { defaultValue: humanizeCode(code) }),
    });

    return (
        <DetailSection
            title={t('derived.title')}
            icon={Cpu}
            testId="vendor-derived-section"
            className="space-y-5"
            actions={(
                <VendorTierPill
                    tier={derived.tier}
                    displayValue={vendorValueLabel(t, 'tier', derived.tier)}
                    testId="vendor-derived-tier"
                />
            )}
        >
            <DetailFieldList className="grid-cols-2 md:grid-cols-4">
                <DetailField label={t('derived.cif')} value={vendorValueLabel(t, 'cif', derived.cif)} testId="vendor-derived-cif" />
                <DetailField
                    label={t('derived.cif_chain')}
                    value={vendorValueLabel(t, 'cif_chain', derived.cif_chain)}
                    testId="vendor-derived-cif-chain"
                />
                <DetailField
                    label={t('derived.max_criticality')}
                    value={(
                        <CriticalityClassPill
                            criticalityClass={derived.max_criticality}
                            displayValue={vendorValueLabel(t, 'max_criticality', derived.max_criticality)}
                        />
                    )}
                />
                <DetailField label={t('derived.country_category')} value={vendorValueLabel(t, 'country_category', derived.country_category)} />
                <DetailField label={t('derived.chain_level')} value={vendorValueLabel(t, 'chain_level', derived.chain_level)} />
                <DetailField
                    label={t('derived.significance_outcome')}
                    value={vendorValueLabel(t, 'significance_outcome', derived.significance_outcome)}
                />
                <DetailField
                    label={t('derived.completeness')}
                    value={completeness}
                    testId="vendor-derived-completeness"
                />
                <DetailField label={t('derived.main_contract_reference')} value={derived.main_contract_reference} />
                <DetailField label={t('derived.linked_asset_count')} value={derived.linked_asset_count} />
                <DetailField label={t('derived.linked_process_count')} value={derived.linked_process_count} />
                <DetailField label={t('derived.cif_process_count')} value={derived.cif_process_count} />
                <DetailField label={t('derived.contract_count')} value={derived.contract_count} />
                <DetailField label={t('derived.main_contract_count')} value={derived.main_contract_count} />
                <DetailField
                    label={t('derived.direct_sub_providers')}
                    value={
                        derived.direct_sub_provider_names.length
                            ? derived.direct_sub_provider_names.join('; ')
                            : derived.direct_sub_provider_count || t('derived.inputs.none')
                    }
                />
            </DetailFieldList>

            <div className="space-y-3 border-t border-border pt-4" data-testid="vendor-derived-transitive">
                <h3 className="text-eyebrow">{t('derived.transitive.title')}</h3>
                {derived.transitive_process_links.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('derived.transitive.empty')}</p>
                ) : (
                    <Table density="compact" regionLabel={t('derived.transitive.title')}>
                        <THead>
                            <TR>
                                <TH>{t('derived.transitive.process')}</TH>
                                <TH>{t('derived.transitive.process_cif')}</TH>
                                <TH>{t('derived.transitive.process_criticality')}</TH>
                                <TH>{t('derived.transitive.via_asset')}</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {derived.transitive_process_links.map((link, index) => (
                                <TR
                                    key={`${link.process_id}-${link.via_asset_id}-${index}`}
                                    className="text-sm"
                                    data-testid={`vendor-derived-transitive-row-${index}`}
                                >
                                    <TD className="font-medium text-foreground">{link.process_name}</TD>
                                    <TD className="text-foreground">{vendorValueLabel(t, 'cif', link.process_cif)}</TD>
                                    <TD>
                                        <CriticalityClassPill
                                            criticalityClass={link.process_criticality}
                                            displayValue={vendorValueLabel(t, 'max_criticality', link.process_criticality)}
                                        />
                                    </TD>
                                    <TD className="text-foreground">{link.via_asset_name}</TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                )}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
                <h3 className="text-eyebrow">{t('derived.inputs.title')}</h3>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField
                        label={t('derived.inputs.cif_asset_link_count')}
                        value={derived.inputs.cif_asset_link_count}
                    />
                    <DetailField
                        label={t('derived.inputs.cif_process_link_count')}
                        value={derived.inputs.cif_process_link_count}
                    />
                    <DetailField
                        label={t('derived.inputs.cloud_service_link_count')}
                        value={derived.inputs.cloud_service_link_count}
                    />
                    <DetailField
                        label={t('derived.inputs.substitutability')}
                        value={vendorValueLabel(t, 'replaceability', derived.inputs.substitutability)}
                    />
                    <DetailField
                        label={t('derived.inputs.tier_max_rank_at_least_high')}
                        value={boolLabel(derived.inputs.tier_max_rank_at_least_high)}
                    />
                    <DetailField
                        label={t('derived.inputs.tier_substitutability_match')}
                        value={boolLabel(derived.inputs.tier_substitutability_match)}
                    />
                    <DetailField
                        label={t('derived.inputs.manual_process_link_count')}
                        value={derived.inputs.manual_process_link_count}
                    />
                    <DetailField
                        label={t('derived.inputs.transitive_process_pair_count')}
                        value={derived.inputs.transitive_process_pair_count}
                    />
                    <DetailField
                        label={t('derived.inputs.missing')}
                        value={
                            derived.inputs.missing_for_completeness.length
                                ? derived.inputs.missing_for_completeness.map(missingFieldLabel).join(', ')
                                : t('derived.inputs.none')
                        }
                        testId="vendor-derived-missing"
                    />
                </DetailFieldList>
            </div>
        </DetailSection>
    );
}
