import type {
    ControlFrequency,
    ControlMonitoringFields,
    ControlStatus,
} from '@/types/control';

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
}

export interface LinkedControl extends ControlMonitoringFields {
    id: number;
    name: string;
    frequency: ControlFrequency | string;
    risk_level: number;
    department_id?: number | null;
    department_name?: string | null;
    status?: ControlStatus | string | null;
}
