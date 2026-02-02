export type VendorIncidentType =
    | 'security'
    | 'operational'
    | 'regulatory_breach'
    | 'contract_breach'
    | 'other';

export type VendorIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface VendorIncident {
    id: number;
    vendor_id: number;
    incident_type: VendorIncidentType;
    severity: VendorIncidentSeverity;
    is_major: boolean;
    occurred_at?: string | null;
    detected_at?: string | null;
    resolved_at?: string | null;
    summary: string;
    details?: string | null;
    created_at: string;
    updated_at: string;
}

export interface VendorIncidentCreate {
    incident_type: VendorIncidentType;
    severity: VendorIncidentSeverity;
    is_major: boolean;
    occurred_at?: string | null;
    detected_at?: string | null;
    resolved_at?: string | null;
    summary: string;
    details?: string | null;
}

export type VendorRemediationStatus = 'open' | 'in_progress' | 'done';

export interface VendorRemediationAction {
    id: number;
    vendor_id: number;
    incident_id?: number | null;
    owner_user_id?: number | null;
    status: VendorRemediationStatus;
    due_at?: string | null;
    completed_at?: string | null;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface VendorRemediationCreate {
    incident_id?: number | null;
    owner_user_id?: number | null;
    status: VendorRemediationStatus;
    due_at?: string | null;
    description: string;
}

export interface VendorRemediationUpdate {
    owner_user_id?: number | null;
    status?: VendorRemediationStatus;
    due_at?: string | null;
    completed_at?: string | null;
    description?: string | null;
}

