import type { UserLookupItem } from '@/services/lookupApi';
import type { RiskSummary } from '@/types/risk';

export interface RiskFilterState {
    riskSearch: string;
    selectedDept: string;
    selectedProcess: string;
    selectedCategory: string;
}

export interface UserFilterState {
    ownerSearch: string;
    roleFilter: string;
    departmentId?: number;
}

export function collectRiskFilterOptions(risks: RiskSummary[]) {
    return {
        uniqueDepartments: [...new Set(risks.map((risk) => risk.department_name).filter(Boolean))].sort() as string[],
        uniqueProcesses: [...new Set(risks.map((risk) => risk.process).filter(Boolean))].sort() as string[],
        uniqueCategories: [...new Set(risks.map((risk) => risk.category).filter(Boolean))].sort() as string[],
    };
}

export function filterRisks(risks: RiskSummary[], filters: RiskFilterState): RiskSummary[] {
    const normalizedSearch = filters.riskSearch.trim().toLowerCase();

    return risks.filter((risk) => {
        const matchesSearch =
            !normalizedSearch ||
            risk.risk_id_code?.toLowerCase().includes(normalizedSearch) ||
            risk.name?.toLowerCase().includes(normalizedSearch) ||
            risk.process.toLowerCase().includes(normalizedSearch) ||
            risk.category?.toLowerCase().includes(normalizedSearch) ||
            risk.department_name?.toLowerCase().includes(normalizedSearch);

        const matchesDepartment = !filters.selectedDept || risk.department_name === filters.selectedDept;
        const matchesProcess = !filters.selectedProcess || risk.process === filters.selectedProcess;
        const matchesCategory = !filters.selectedCategory || risk.category === filters.selectedCategory;

        return matchesSearch && matchesDepartment && matchesProcess && matchesCategory;
    });
}

export function filterUsers(users: UserLookupItem[], filters: UserFilterState): UserLookupItem[] {
    const normalizedSearch = filters.ownerSearch.trim().toLowerCase();

    return users.filter((user) => {
        const matchesSearch =
            !normalizedSearch ||
            user.name?.toLowerCase().includes(normalizedSearch) ||
            user.email?.toLowerCase().includes(normalizedSearch);
        const matchesRole = !filters.roleFilter || user.role_name === filters.roleFilter;
        const matchesDepartment = !filters.departmentId || user.department_id === filters.departmentId;

        return matchesSearch && matchesRole && matchesDepartment;
    });
}

export function getUniqueRoles(users: UserLookupItem[]): string[] {
    return [...new Set(users.map((user) => user.role_name).filter((role): role is string => !!role))];
}

export function getOwnerAutoDepartmentId(users: UserLookupItem[], ownerId: unknown): number | undefined {
    if (typeof ownerId !== 'number') {
        return undefined;
    }
    return users.find((user) => user.id === ownerId)?.department_id ?? undefined;
}
