import { Search, Target, X } from 'lucide-react';

import { RiskPickerOption } from '@/components/risks/RiskPickerOption';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { RiskSummary } from '@/types/risk';

import type { KRIFormVendorContext } from './kriForm.types';
import { LoadingState } from '@/components/ui/state';

interface KriRiskSelectionStepProps {
    filteredRisks: RiskSummary[];
    isLoadingRisks: boolean;
    isSelectedRiskLinkedToVendor: boolean;
    onClearSelectedRisk: () => void;
    onRiskSearchChange: (value: string) => void;
    onRiskSelect: (riskId: number) => void;
    onSelectedCategoryChange: (value: string) => void;
    onSelectedDeptIdChange: (value: string) => void;
    onSelectedProcessChange: (value: string) => void;
    onShowOnlyVendorLinkedRisksChange: (value: boolean) => void;
    riskSearch: string;
    selectedCategory: string;
    selectedDeptId: string;
    selectedProcess: string;
    selectedRisk: RiskSummary | undefined;
    showOnlyVendorLinkedRisks: boolean;
    uniqueCategories: string[];
    uniqueDepartments: Array<{ value: string; label: string }>;
    uniqueProcesses: string[];
    vendorContext: KRIFormVendorContext | null;
}

export function KriRiskSelectionStep({
    filteredRisks,
    isLoadingRisks,
    isSelectedRiskLinkedToVendor,
    onClearSelectedRisk,
    onRiskSearchChange,
    onRiskSelect,
    onSelectedCategoryChange,
    onSelectedDeptIdChange,
    onSelectedProcessChange,
    onShowOnlyVendorLinkedRisksChange,
    riskSearch,
    selectedCategory,
    selectedDeptId,
    selectedProcess,
    selectedRisk,
    showOnlyVendorLinkedRisks,
    uniqueCategories,
    uniqueDepartments,
    uniqueProcesses,
    vendorContext,
}: KriRiskSelectionStepProps) {
    const { t } = useTranslation(['common', 'kris']);

    return (
        <section className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-eyebrow flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent-text" aria-hidden="true" />
                    {t('kris:actions.link_risk')}
                </h2>
                {vendorContext ? (
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-nested p-1" role="group" aria-label={t('kris:vendor_assignment.risk_scope')}>
                        <Button
                            size="compact"
                            variant={showOnlyVendorLinkedRisks ? 'accent' : 'ghost'}
                            aria-pressed={showOnlyVendorLinkedRisks}
                            onClick={() => onShowOnlyVendorLinkedRisksChange(true)}
                        >
                            {t('kris:vendor_assignment.vendor_risks_only')}
                        </Button>
                        <Button
                            size="compact"
                            variant={!showOnlyVendorLinkedRisks ? 'accent' : 'ghost'}
                            aria-pressed={!showOnlyVendorLinkedRisks}
                            onClick={() => onShowOnlyVendorLinkedRisksChange(false)}
                        >
                            {t('kris:vendor_assignment.all_readable_risks')}
                        </Button>
                    </div>
                ) : null}
            </div>

            {selectedRisk ? (
                <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-foreground">{selectedRisk.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {selectedRisk.process} • {selectedRisk.category || t('common:labels.unknown')}
                            </p>
                            <p className="mt-2 text-xs italic text-foreground">{selectedRisk.description}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedRisk.department_name ? (
                                    <Badge size="sm" shape="rounded">
                                        {selectedRisk.department_name}
                                    </Badge>
                                ) : null}
                                {vendorContext ? (
                                    <Badge size="sm" shape="rounded" tone={isSelectedRiskLinkedToVendor ? 'success' : 'warning'}>
                                        {isSelectedRiskLinkedToVendor
                                            ? t('kris:vendor_assignment.risk_linked_to_vendor')
                                            : t('kris:vendor_assignment.risk_not_linked_to_vendor')}
                                    </Badge>
                                ) : null}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="iconCompact"
                            onClick={onClearSelectedRisk}
                            aria-label={t('common:actions.clear_selection_named', { name: selectedRisk.name })}
                        >
                            <X aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <ThemedSelect
                            value={selectedDeptId}
                            triggerAriaLabel={t('common:labels.department')}
                            onValueChange={onSelectedDeptIdChange}
                            placeholder={t('kris:form.placeholders.all_departments')}
                            allowEmpty
                            emptyLabel={t('kris:form.placeholders.all_departments')}
                            options={uniqueDepartments}
                        />
                        <ThemedSelect
                            value={selectedProcess}
                            triggerAriaLabel={t('common:labels.process')}
                            onValueChange={onSelectedProcessChange}
                            placeholder={t('kris:form.placeholders.all_processes')}
                            allowEmpty
                            emptyLabel={t('kris:form.placeholders.all_processes')}
                            options={uniqueProcesses.map((process) => ({ value: process, label: process }))}
                        />
                        <ThemedSelect
                            value={selectedCategory}
                            triggerAriaLabel={t('common:labels.category')}
                            onValueChange={onSelectedCategoryChange}
                            placeholder={t('kris:form.placeholders.all_categories')}
                            allowEmpty
                            emptyLabel={t('kris:form.placeholders.all_categories')}
                            options={uniqueCategories.map((category) => ({ value: category, label: category }))}
                        />
                    </div>

                    <Input
                        type="text"
                        leadingIcon={Search}
                        aria-label={t('kris:form.placeholders.search_risks')}
                        placeholder={t('kris:form.placeholders.search_risks')}
                        value={riskSearch}
                        onChange={(event) => onRiskSearchChange(event.target.value)}
                    />

                    <div className="custom-scrollbar max-h-[400px] overflow-y-auto rounded-xl border border-border divide-y divide-border">
                        {isLoadingRisks ? (
                            <LoadingState className="p-8" label={t('common:loading.risk_data')} />
                        ) : filteredRisks.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                {showOnlyVendorLinkedRisks && vendorContext
                                    ? t('kris:vendor_assignment.no_vendor_risks')
                                    : t('common:labels.no_results')}
                            </div>
                        ) : (
                            filteredRisks.slice(0, 20).map((risk) => (
                                <RiskPickerOption key={risk.id} risk={risk} onSelect={() => onRiskSelect(risk.id)} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
