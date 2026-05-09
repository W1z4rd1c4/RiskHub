import type {
    ControlFrequency,
    ControlMonitoringFields,
    ControlStatus,
} from '@/types/control';
import type { KRIFrequency, KRIMonitoringFields } from '@/types/kri';

export interface LinkedVendorSummary {
    id: number;
    name: string;
    status?: string | null;
    is_archived?: boolean;
}

export interface LinkedRisk {
    id: number;
    risk_id_code: string;
    name: string;
    process: string;
    risk_type?: string | null;
    category?: string | null;
    gross_score?: number | null;
    net_score?: number | null;
    is_priority: boolean;
    department_id?: number | null;
    department_name?: string | null;
    status?: string | null;
    is_archived?: boolean;
}

export interface LinkedControl extends ControlMonitoringFields {
    id: number;
    name: string;
    frequency: ControlFrequency | string;
    risk_level: number;
    department_id?: number | null;
    department_name?: string | null;
    status?: ControlStatus | string | null;
    is_archived?: boolean;
}

export interface LinkedKRI extends KRIMonitoringFields {
    id: number;
    risk_id: number;
    metric_name: string;
    description: string;
    current_value: number;
    lower_limit: number;
    upper_limit: number;
    unit: string;
    frequency: KRIFrequency | string;
    risk_name?: string | null;
    risk_process?: string | null;
    risk_department_name?: string | null;
    is_archived?: boolean;
}
