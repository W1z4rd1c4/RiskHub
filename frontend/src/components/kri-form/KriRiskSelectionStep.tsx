import { Search, Target, X } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { RiskSummary } from '@/types/risk';

import type { KRIFormVendorContext } from './kriForm.types';

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
                <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground">
                    <Target className="h-4 w-4 text-accent" />
                    {t('kris:actions.link_risk')}
                </h3>
                {vendorContext ? (
                    <div className="flex items-center rounded-lg border border-border bg-tint/[0.03] p-1">
                        <button
                            type="button"
                            onClick={() => onShowOnlyVendorLinkedRisksChange(true)}
                            className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                                showOnlyVendorLinkedRisks
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t('kris:vendor_assignment.vendor_risks_only')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onShowOnlyVendorLinkedRisksChange(false)}
                            className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                                !showOnlyVendorLinkedRisks
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t('kris:vendor_assignment.all_readable_risks')}
                        </button>
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
                                    <span className="inline-block rounded bg-tint/10 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                                        {selectedRisk.department_name}
                                    </span>
                                ) : null}
                                {vendorContext ? (
                                    <span
                                        className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                            isSelectedRiskLinkedToVendor
                                                ? 'border-success/20 bg-success/10 text-success-text'
                                                : 'border-warning/20 bg-warning/10 text-warning-text'
                                        }`}
                                    >
                                        {isSelectedRiskLinkedToVendor
                                            ? t('kris:vendor_assignment.risk_linked_to_vendor')
                                            : t('kris:vendor_assignment.risk_not_linked_to_vendor')}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClearSelectedRisk}
                            aria-label={t('common:actions.clear_selection_named', { name: selectedRisk.name })}
                            className="rounded-lg p-2 transition-colors hover:bg-tint/10"
                        >
                            <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <ThemedSelect
                            value={selectedDeptId}
                            onValueChange={onSelectedDeptIdChange}
                            placeholder={t('kris:form.placeholders.all_departments')}
                            allowEmpty
                            emptyLabel={t('kris:form.placeholders.all_departments')}
                            options={uniqueDepartments}
                        />
                        <ThemedSelect
                            value={selectedProcess}
                            onValueChange={onSelectedProcessChange}
                            placeholder={t('kris:form.placeholders.all_processes')}
                            allowEmpty
                            emptyLabel={t('kris:form.placeholders.all_processes')}
                            options={uniqueProcesses.map((process) => ({ value: process, label: process }))}
                        />
                        <ThemedSelect
                            value={selectedCategory}
                            onValueChange={onSelectedCategoryChange}
                            placeholder={t('kris:form.placeholders.all_categories')}
                            allowEmpty
                            emptyLabel={t('kris:form.placeholders.all_categories')}
                            options={uniqueCategories.map((category) => ({ value: category, label: category }))}
                        />
                    </div>

                    <div className="group flex items-center gap-3 rounded-xl border border-border bg-tint/5 px-4 py-2.5 transition-all focus-within:border-accent/50">
                        <Search className="h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-accent" />
                        <input
                            type="text"
                            placeholder={t('kris:form.placeholders.search_risks')}
                            value={riskSearch}
                            onChange={(event) => onRiskSearchChange(event.target.value)}
                            className="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        />
                    </div>

                    <div className="custom-scrollbar max-h-[400px] overflow-y-auto rounded-xl border border-border divide-y divide-border">
                        {isLoadingRisks ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                                {t('common:loading.risk_data')}
                            </div>
                        ) : filteredRisks.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                {showOnlyVendorLinkedRisks && vendorContext
                                    ? t('kris:vendor_assignment.no_vendor_risks')
                                    : t('common:labels.no_results')}
                            </div>
                        ) : (
                            filteredRisks.slice(0, 20).map((risk) => (
                                <button
                                    key={risk.id}
                                    type="button"
                                    onClick={() => onRiskSelect(risk.id)}
                                    className="group flex w-full items-stretch gap-2 p-2 text-left transition-all hover:brightness-125"
                                >
                                    <div className="w-[200px] shrink-0 rounded-lg bg-tint/5 p-3 transition-colors group-hover:bg-tint/10">
                                        <p className="truncate text-sm font-bold text-foreground" title={risk.name}>
                                            {risk.name}
                                        </p>
                                        <p className="mt-1 truncate text-[10px] text-muted-foreground" title={risk.process}>
                                            {risk.process}
                                        </p>
                                    </div>
                                    <div className="flex flex-1 items-center rounded-lg bg-tint/5 p-3 transition-colors group-hover:bg-tint/10">
                                        {risk.description ? (
                                            <p className="break-words text-[10px] leading-tight text-muted-foreground">
                                                {risk.description.length > 120
                                                    ? `${risk.description.slice(0, 120)}...`
                                                    : risk.description}
                                            </p>
                                        ) : (
                                            <span className="text-[10px] italic text-muted-foreground">
                                                {t('common:empty.no_description')}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
