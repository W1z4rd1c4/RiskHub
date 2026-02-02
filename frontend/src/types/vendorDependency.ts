export type VendorRelationshipType = 'subcontractor' | 'reseller' | 'parent_company' | 'other';

export interface VendorRelationship {
    id: number;
    vendor_id: number;
    related_vendor_id: number;
    related_vendor_name?: string | null;
    relationship_type: VendorRelationshipType;
    created_at: string;
}

export interface VendorDependency {
    id: number;
    vendor_service_id: number;
    risk_id?: number | null;
    risk_name?: string | null;
    department_id?: number | null;
    department_name?: string | null;
    supported_function_name?: string | null;
    created_at: string;
}

export interface VendorService {
    id: number;
    vendor_id: number;
    service_name: string;
    notes?: string | null;
    dependencies: VendorDependency[];
    created_at: string;
    updated_at: string;
}

export interface VendorDependencyGraphNode {
    vendor_id: number;
    vendor_name: string;
    relationship_type?: VendorRelationshipType | null;
    children: VendorDependencyGraphNode[];
}

export interface VendorConcentrationFlag {
    key: string;
    severity: string;
    reason: string;
}

export interface VendorConcentrationSummary {
    score: number;
    flags: VendorConcentrationFlag[];
}

export interface VendorDependenciesResponse {
    vendor_id: number;
    relationships: VendorRelationship[];
    services: VendorService[];
    relationship_tree: VendorDependencyGraphNode;
    concentration: VendorConcentrationSummary;
}

export interface VendorRelationshipCreate {
    related_vendor_id: number;
    relationship_type: VendorRelationshipType;
}

export interface VendorServiceCreate {
    service_name: string;
    notes?: string | null;
}

export interface VendorDependencyCreate {
    risk_id?: number | null;
    department_id?: number | null;
    supported_function_name?: string | null;
}

