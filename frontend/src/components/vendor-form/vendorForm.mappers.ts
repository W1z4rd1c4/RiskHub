import type { SafeTFunction } from '@/i18n/hooks';
import type {
    VendorCreate,
    VendorReplaceability,
    VendorType,
} from '@/types/vendor';

import type { DepartmentLookup, VendorFormData } from './vendorForm.types';

export function buildOwnerOptions(
    users: Array<{
        id: number;
        name: string;
        department_name?: string | null;
    }>,
): Array<{ value: string; label: string }> {
    return users.map((user) => ({
        value: String(user.id),
        label: user.department_name ? `${user.name} — ${user.department_name}` : user.name,
    }));
}

export function buildDepartmentOptions(
    departments: DepartmentLookup[],
): Array<{ value: string; label: string }> {
    return departments.map((department) => ({
        value: String(department.id),
        label: department.code ? `${department.name} (${department.code})` : department.name,
    }));
}

export function filterSuggestions(items: string[], query: string | null | undefined): string[] {
    const normalizedQuery = (query ?? '').toLowerCase();
    return items.filter((item) => item.toLowerCase().includes(normalizedQuery));
}

export function validateVendorForm(formData: VendorFormData, t: SafeTFunction): string | null {
    if (!formData.name?.trim()) {
        return t('errors.name_required');
    }
    if (!formData.process?.trim()) {
        return t('errors.process_required');
    }
    if (!formData.department_id) {
        return t('errors.department_required');
    }
    if (!formData.outsourcing_owner_user_id) {
        return t('errors.owner_required');
    }
    if (!formData.risk_score_1_5 || formData.risk_score_1_5 < 1 || formData.risk_score_1_5 > 5) {
        return t('errors.score_required');
    }
    return null;
}

function trimOrNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function buildVendorPayload(formData: VendorFormData): VendorCreate {
    return {
        name: formData.name?.trim() || '',
        legal_name: trimOrNull(formData.legal_name),
        registration_id: trimOrNull(formData.registration_id),
        country: trimOrNull(formData.country),
        website: trimOrNull(formData.website),
        description: trimOrNull(formData.description),
        process: formData.process?.trim() || '',
        subprocess: trimOrNull(formData.subprocess),
        department_id: formData.department_id ?? null,
        outsourcing_owner_user_id: formData.outsourcing_owner_user_id || 0,
        vendor_type: (formData.vendor_type || 'other') as VendorType,
        risk_score_1_5: formData.risk_score_1_5 || 3,
        supports_important_core_insurance_function: !!formData.supports_important_core_insurance_function,
        dora_relevant: !!formData.dora_relevant,
        is_significant_vendor: !!formData.is_significant_vendor,
        materiality_assessed_max_impact_pct_own_funds:
            formData.materiality_assessed_max_impact_pct_own_funds ?? null,
        replaceability: (formData.replaceability || null) as VendorReplaceability | null,
        has_alternative_providers: !!formData.has_alternative_providers,
        status: 'active',
    };
}

export function getOwnerAutoDepartmentId(
    users: Array<{ id: number; department_id?: number | null }>,
    ownerId: unknown,
    currentDepartmentId: number | null | undefined,
): number | null | undefined {
    if (currentDepartmentId) {
        return currentDepartmentId;
    }
    const selectedUser = users.find((user) => user.id === ownerId);
    return selectedUser?.department_id ?? currentDepartmentId;
}

export function getSubprocessSuggestions(
    subprocessesByProcess: Record<string, string[]>,
    process: string | null | undefined,
    subprocessQuery: string | null | undefined,
): string[] {
    return filterSuggestions(subprocessesByProcess[process || ''] || [], subprocessQuery);
}

export function scoreColor(score: number): string {
    if (score >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    if (score >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (score >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (score >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}
