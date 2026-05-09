import { controlApi } from '@/services/controlApi';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';

import type { DepartmentLookup, LinkMode, SearchResultItem } from './linkTypes';

interface SearchLinkTargetsArgs {
    mode: LinkMode;
    searchQuery: string;
    selectedDeptId: number | null;
    selectedProcess: string;
    selectedCategory: string;
    includeArchived: boolean;
    departments: DepartmentLookup[];
    linkedTargetIdSet: Set<number | undefined>;
}

function buildCollectionParams(args: SearchLinkTargetsArgs): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {
        offset: 0,
        limit: 20,
    };

    if (args.searchQuery) params.search = args.searchQuery;
    if (args.selectedDeptId) params.department_id = args.selectedDeptId;
    if (args.selectedProcess) params.process = args.selectedProcess;
    if (args.selectedCategory) params.category = args.selectedCategory;
    if (args.includeArchived) params.include_archived = true;

    return params;
}

function mapRiskResult(item: RiskSummary): SearchResultItem {
    return {
        id: item.id,
        is_archived: item.is_archived,
        name: item.name,
        description: item.description,
        process: item.process,
        category: item.category,
        status: item.status,
        capabilities: item.capabilities,
    };
}

function mapControlResult(item: ControlSummary): SearchResultItem {
    return {
        id: item.id,
        is_archived: item.is_archived,
        name: item.name,
        description: item.description,
        status: item.status,
        risk_level: item.risk_level,
        frequency: item.frequency,
        department_name: item.department_name,
        control_owner_name: item.control_owner_name,
        capabilities: item.capabilities,
    };
}

function mapKriResult(item: KeyRiskIndicator): SearchResultItem {
    return {
        id: item.id,
        is_archived: item.is_archived,
        name: item.metric_name,
        description: item.description,
        status: String(item.monitoring_status ?? ''),
        department_name: item.risk_department_name,
        process: item.risk_process,
        category: item.risk_category,
        capabilities: item.capabilities,
    };
}

function matchesKriFilters(
    item: {
        id: number;
        risk_department_name?: string | null;
        risk_process?: string | null;
        risk_category?: string | null;
    },
    args: SearchLinkTargetsArgs,
): boolean {
    if (args.linkedTargetIdSet.has(item.id)) return false;
    if (
        args.selectedDeptId
        && !args.departments.some(
            (department) =>
                department.id === args.selectedDeptId
                && department.name === item.risk_department_name,
        )
    ) {
        return false;
    }
    if (args.selectedProcess && item.risk_process !== args.selectedProcess) return false;
    if (args.selectedCategory && item.risk_category !== args.selectedCategory) return false;
    return true;
}

export async function searchLinkTargets(args: SearchLinkTargetsArgs): Promise<SearchResultItem[]> {
    if (args.mode === 'control-to-risk') {
        const results = await riskApi.getRisks(buildCollectionParams(args));
        return results.items
            .filter((item) => !args.linkedTargetIdSet.has(item.id))
            .map(mapRiskResult);
    }

    if (args.mode === 'risk-to-control') {
        const results = await controlApi.getControls(buildCollectionParams(args));
        return results.items
            .filter((item) => !args.linkedTargetIdSet.has(item.id))
            .map(mapControlResult);
    }

    const results = await kriApi.getKRIs({
        offset: 0,
        limit: 100,
        include_archived: args.includeArchived,
        search: args.searchQuery || undefined,
    });
    return results.items
        .filter((item) => matchesKriFilters(item, args))
        .map(mapKriResult);
}

export async function restoreLinkTarget(mode: LinkMode, targetId: number): Promise<void> {
    switch (mode) {
        case 'control-to-risk':
            await riskApi.restoreRisk(targetId);
            return;
        case 'risk-to-control':
            await controlApi.restoreControl(targetId);
            return;
        case 'vendor-to-kri':
            await kriApi.restoreKRI(targetId);
            return;
    }
}
