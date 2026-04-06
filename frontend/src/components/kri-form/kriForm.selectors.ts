import type { RiskSummary } from '@/types/risk';

import type { KRIFormVendorContext } from './kriForm.types';
import { mergeRiskSummaries } from './kriForm.utils';

interface KriFilterArgs {
    displayedRisks: RiskSummary[];
    riskSearch: string;
    selectedDeptId: string;
    selectedProcess: string;
    selectedCategory: string;
    showOnlyVendorLinkedRisks: boolean;
    vendorContext: KRIFormVendorContext | null;
    vendorLinkedRiskIds: number[];
}

interface KriOption {
    value: string;
    label: string;
}

export function getEffectiveVendorIds(
    selectedVendorIds: number[],
    vendorContext: KRIFormVendorContext | null,
): number[] {
    return vendorContext
        ? Array.from(new Set([...selectedVendorIds, vendorContext.vendorId]))
        : selectedVendorIds;
}

export function getDisplayedRisks(args: {
    showOnlyVendorLinkedRisks: boolean;
    vendorContext: KRIFormVendorContext | null;
    genericRisks: RiskSummary[];
    vendorLinkedRisks: RiskSummary[];
}): RiskSummary[] {
    const { genericRisks, showOnlyVendorLinkedRisks, vendorContext, vendorLinkedRisks } = args;
    return showOnlyVendorLinkedRisks && vendorContext ? vendorLinkedRisks : genericRisks;
}

export function getKnownRisks(args: {
    displayedRisks: RiskSummary[];
    vendorLinkedRisks: RiskSummary[];
    genericRisks: RiskSummary[];
    selectedRiskRecord: RiskSummary | null;
}): RiskSummary[] {
    const { displayedRisks, genericRisks, selectedRiskRecord, vendorLinkedRisks } = args;
    return mergeRiskSummaries(
        displayedRisks,
        vendorLinkedRisks,
        genericRisks,
        selectedRiskRecord ? [selectedRiskRecord] : [],
    );
}

export function buildDepartmentOptions(displayedRisks: RiskSummary[]): KriOption[] {
    return Array.from(
        new Map(
            displayedRisks
                .filter((risk) => risk.department_id && risk.department_name)
                .map((risk) => [risk.department_id as number, risk.department_name as string]),
        ).entries(),
    )
        .map(([id, name]) => ({ value: String(id), label: name }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

export function getUniqueProcesses(displayedRisks: RiskSummary[]): string[] {
    return [...new Set(displayedRisks.map((risk) => risk.process).filter(Boolean))].sort() as string[];
}

export function getUniqueCategories(displayedRisks: RiskSummary[]): string[] {
    return [...new Set(displayedRisks.map((risk) => risk.category).filter(Boolean))].sort() as string[];
}

export function filterRisksForSelection({
    displayedRisks,
    riskSearch,
    selectedDeptId,
    selectedProcess,
    selectedCategory,
    showOnlyVendorLinkedRisks,
    vendorContext,
    vendorLinkedRiskIds,
}: KriFilterArgs): RiskSummary[] {
    const loweredSearch = riskSearch.toLowerCase();

    return displayedRisks.filter((risk) => {
        const matchesSearch = !loweredSearch
            || risk.risk_id_code?.toLowerCase().includes(loweredSearch)
            || risk.name?.toLowerCase().includes(loweredSearch)
            || risk.process.toLowerCase().includes(loweredSearch)
            || risk.category?.toLowerCase().includes(loweredSearch)
            || risk.department_name?.toLowerCase().includes(loweredSearch);

        const matchesDept = !selectedDeptId || String(risk.department_id ?? '') === selectedDeptId;
        const matchesProcess = !selectedProcess || risk.process === selectedProcess;
        const matchesCategory = !selectedCategory || risk.category === selectedCategory;
        const matchesVendorScope = !showOnlyVendorLinkedRisks || !vendorContext
            ? true
            : vendorLinkedRiskIds.includes(risk.id);

        return matchesSearch && matchesDept && matchesProcess && matchesCategory && matchesVendorScope;
    });
}

export function isRiskLinkedToVendor(
    riskId: number | undefined,
    vendorContext: KRIFormVendorContext | null,
    vendorLinkedRiskIds: number[],
): boolean {
    return Boolean(vendorContext && riskId && vendorLinkedRiskIds.includes(riskId));
}
