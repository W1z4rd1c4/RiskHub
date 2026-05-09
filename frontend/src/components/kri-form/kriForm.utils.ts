import { getKriDraftValidationErrorKey } from '@/components/kri/kriFormValidation';
import type { KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import type { KRICreate } from '@/types/kri';
import type { Risk, RiskSummary } from '@/types/risk';
import type { LinkedRisk } from '@/types/vendorLink';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function mergeVendorOptions(
    current: KRIVendorOption[],
    incoming: KRIVendorOption[],
): KRIVendorOption[] {
    const merged = new Map<number, KRIVendorOption>();
    for (const vendor of current) {
        merged.set(vendor.id, vendor);
    }
    for (const vendor of incoming) {
        merged.set(vendor.id, vendor);
    }
    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function syncSelectedVendorOptions(
    vendorIds: number[],
    selectedVendorOptions: KRIVendorOption[],
    vendorOptions: KRIVendorOption[],
) {
    return mergeVendorOptions(
        selectedVendorOptions.filter((vendor) => vendorIds.includes(vendor.id)),
        vendorOptions.filter((vendor) => vendorIds.includes(vendor.id)),
    );
}

export function validateRiskSelection(
    riskId: number | undefined,
    setError: (error: string | null) => void,
    t: TranslateFn,
) {
    if (!riskId) {
        setError(t('kris:form.validation.risk_required'));
        return false;
    }
    return true;
}

export function validateKriDetails(
    formData: Partial<KRICreate> | undefined,
    setError: (error: string | null) => void,
    t: TranslateFn,
) {
    const validationError = getKriDraftValidationErrorKey(formData ?? {});
    if (validationError) {
        setError(t(validationError, { ns: 'kris' }));
        return false;
    }
    return true;
}

export function mergeRiskSummaries<T extends { id: number }>(...riskSets: T[][]): T[] {
    const merged = new Map<number, T>();
    for (const riskSet of riskSets) {
        for (const risk of riskSet) {
            merged.set(risk.id, risk);
        }
    }
    return [...merged.values()];
}

export function mapLinkedRiskToSummary(risk: LinkedRisk): RiskSummary {
    return {
        id: risk.id,
        risk_id_code: risk.risk_id_code,
        name: risk.name,
        process: risk.process,
        risk_type: risk.risk_type ?? '',
        category: risk.category ?? '',
        description: '',
        gross_score: risk.gross_score ?? 0,
        gross_probability: 0,
        gross_impact: 0,
        net_score: risk.net_score ?? 0,
        status: (risk.status as RiskSummary['status']) ?? 'active',
        is_archived: risk.is_archived ?? false,
        is_priority: risk.is_priority,
        department_id: risk.department_id ?? undefined,
        department_name: risk.department_name ?? undefined,
    };
}

export function mapRiskToSummary(risk: Risk): RiskSummary {
    return {
        id: risk.id,
        risk_id_code: risk.risk_id_code,
        name: risk.name,
        process: risk.process,
        risk_type: risk.risk_type,
        category: risk.category,
        description: risk.description,
        gross_score: risk.gross_score,
        gross_probability: risk.gross_probability,
        gross_impact: risk.gross_impact,
        net_score: risk.net_score,
        status: risk.status,
        is_archived: risk.is_archived,
        is_priority: risk.is_priority,
        department_id: risk.department_id,
        department_name: risk.department?.name ?? risk.department?.code ?? undefined,
        owner_id: risk.owner_id ?? undefined,
    };
}
