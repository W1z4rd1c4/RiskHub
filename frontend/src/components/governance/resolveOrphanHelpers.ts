import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ControlRiskLink } from '@/types/control';
import type { OrphanedItem } from '@/types/orphanedItem';
import type { RiskSummary } from '@/types/risk';
import type { UserRead } from '@/types/user';

export interface OrphanUserOption {
    id: number;
    name: string;
    email: string;
    department_id: number | null;
    department_name?: string;
    employee_type?: string;
}

export type OrphanUserRead = UserRead & {
    department_name?: string;
    employee_type?: string;
};

export interface OrphanResolutionRequirements {
    isKri: boolean;
    requiresOwner: boolean;
    requiresRisk: boolean;
    shouldShowOwner: boolean;
    shouldShowRisk: boolean;
}

export function toActiveUserOptions(users: OrphanUserRead[]): OrphanUserOption[] {
    return users
        .filter((user) => user.is_active)
        .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            department_id: user.department_id,
            department_name: user.department_name,
            employee_type: user.employee_type,
        }));
}

export function filterRisks(
    risks: RiskSummary[],
    searchQuery: string,
    selectedRiskDepartment: string,
): RiskSummary[] {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return risks.filter((risk) => {
        const matchesSearch = !normalizedSearch
            || risk.name?.toLowerCase().includes(normalizedSearch)
            || risk.risk_id_code?.toLowerCase().includes(normalizedSearch)
            || risk.process?.toLowerCase().includes(normalizedSearch)
            || risk.category?.toLowerCase().includes(normalizedSearch)
            || risk.description?.toLowerCase().includes(normalizedSearch)
            || risk.department_name?.toLowerCase().includes(normalizedSearch);
        const matchesDepartment = !selectedRiskDepartment || risk.department_name === selectedRiskDepartment;
        return matchesSearch && matchesDepartment;
    });
}

export function uniqueRiskDepartments(risks: RiskSummary[]): string[] {
    return [...new Set(risks.map((risk) => risk.department_name).filter(Boolean))].sort() as string[];
}

export function sortedAssignableUsers(
    users: OrphanUserOption[],
    searchQuery: string,
    selectedDepartmentFilter: string | null,
    orphanDepartmentName: string | null,
): OrphanUserOption[] {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredUsers = users.filter((user) => {
        const matchesSearch = !normalizedSearch
            || user.name.toLowerCase().includes(normalizedSearch)
            || user.email.toLowerCase().includes(normalizedSearch);
        const matchesDepartment = !selectedDepartmentFilter || user.department_name === selectedDepartmentFilter;
        return matchesSearch && matchesDepartment;
    });

    return [...filteredUsers].sort((left, right) => {
        if (orphanDepartmentName) {
            const leftDepartmentMatch = left.department_name === orphanDepartmentName;
            const rightDepartmentMatch = right.department_name === orphanDepartmentName;
            if (leftDepartmentMatch && !rightDepartmentMatch) {
                return -1;
            }
            if (!leftDepartmentMatch && rightDepartmentMatch) {
                return 1;
            }
            if (leftDepartmentMatch && rightDepartmentMatch) {
                if (left.employee_type === 'head' && right.employee_type !== 'head') {
                    return -1;
                }
                if (left.employee_type !== 'head' && right.employee_type === 'head') {
                    return 1;
                }
            }
        }
        return left.name.localeCompare(right.name);
    });
}

export function getOrphanResolutionRequirements(
    orphan: OrphanedItem,
    linkedRisks: ControlRiskLink[],
    isInitialized: boolean,
): OrphanResolutionRequirements {
    const isKri = orphan.item_type === 'kri';
    const requiresOwner = resolveCapabilityFlag(orphan.capabilities, 'requires_owner', !isKri);
    const requiresRisk = resolveCapabilityFlag(orphan.capabilities, 'requires_risk', isKri);
    const shouldShowRisk = requiresRisk || (
        orphan.item_type === 'control' && isInitialized && linkedRisks.length === 0
    );
    return {
        isKri,
        requiresOwner,
        requiresRisk,
        shouldShowOwner: requiresOwner,
        shouldShowRisk,
    };
}

export function canSubmitOrphanResolution({
    isInitialized,
    isSubmitting,
    orphan,
    requirements,
    selectedDepartmentId,
    selectedRiskId,
    selectedUserId,
}: {
    isInitialized: boolean;
    isSubmitting: boolean;
    orphan: OrphanedItem;
    requirements: OrphanResolutionRequirements;
    selectedDepartmentId: number | null;
    selectedRiskId: number | null;
    selectedUserId: number | null;
}): boolean {
    if (!isInitialized || isSubmitting) {
        return false;
    }
    if (requirements.shouldShowRisk && !selectedRiskId) {
        return false;
    }
    if (requirements.shouldShowOwner && !selectedUserId) {
        return false;
    }
    if (orphan.item_type === 'control' && !selectedUserId && !selectedDepartmentId) {
        return false;
    }
    if (!requirements.isKri && orphan.item_type !== 'control' && !selectedUserId) {
        return false;
    }
    return true;
}
