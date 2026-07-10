// ICT Register data-quality read model (issue #50) — the workbook's
// 15_Kontroly_kvality sheet computed on read: 52 checks, threshold 0,
// OK/NÁLEZ status, violating rows with drill-down anchors.

export type IctDqStatus = 'OK' | 'NÁLEZ';

export interface IctDqViolatingRow {
    entity_type: string;
    entity_id: number;
    label: string;
    route_entity_type: string;
    route_entity_id: number;
}

export interface IctDqCheck {
    check_id: string;
    area: string;
    title_cs: string;
    severity: string;
    threshold: number;
    count: number;
    status: string;
    violating_rows: IctDqViolatingRow[];
}

export interface IctRegisterDq {
    checks: IctDqCheck[];
    finding_count: number;
}
