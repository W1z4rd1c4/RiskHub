export interface LinkedRisk {
    id: number;
    risk_id_code: string;
    name: string;
    process: string;
    category?: string | null;
    department_id?: number | null;
    department_name?: string | null;
}

export interface LinkedControl {
    id: number;
    name: string;
    department_id?: number | null;
    department_name?: string | null;
    status?: string | null;
}

