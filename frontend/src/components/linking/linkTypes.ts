import type { ControlEffectiveness } from '@/types/risk';

export type LinkMode = 'control-to-risk' | 'risk-to-control' | 'vendor-to-kri';

export interface DepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

export interface SearchResultItem {
    id: number;
    name?: string | null;
    description?: string | null;
    process?: string | null;
    category?: string | null;
    status?: string | null;
    risk_level?: number;
    frequency?: string | null;
    department?: { name?: string | null };
    department_name?: string | null;
    control_owner_name?: string | null;
}

export interface ExistingLinkItem {
    display_name?: string;
    id: number;
    risk_id?: number;
    control_id?: number;
    kri_id?: number;
    effectiveness: ControlEffectiveness | 'linked' | string;
    notes?: string | null;
    risk?: unknown;
    control?: unknown;
}
