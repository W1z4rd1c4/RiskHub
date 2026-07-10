import type { IctDqCheck, IctDqViolatingRow } from '@/types/ictRegisterDq';

// Presentation helpers for the ICT Register data-quality page (issue #50).
// The API serves the workbook's CZ areas/severities/statuses verbatim; these
// helpers map them onto stable i18n keys and drill-down routes.

export const DQ_STATUS_FINDING = 'NÁLEZ';
export const DQ_STATUS_OK = 'OK';

export type DqStatusFilter = 'all' | 'findings';

const AREA_KEYS: Record<string, string> = {
    Procesy: 'processes',
    Aktiva: 'assets',
    Vazby: 'links',
    Dodavatelé: 'vendors',
    Rizika: 'risks',
    Integrita: 'integrity',
    Smlouvy: 'contracts',
};

const SEVERITY_KEYS: Record<string, string> = {
    Kritická: 'critical',
    Vysoká: 'high',
    Střední: 'medium',
};

// Violating rows anchor on a routable register detail page; contracts and
// sub-outsourcing rows anchor on their owning Vendor.
const ROUTE_PATHS: Record<string, (id: number) => string> = {
    process: (id) => `/processes/${id}`,
    asset: (id) => `/assets/${id}`,
    vendor: (id) => `/vendors/${id}`,
    risk: (id) => `/risks/${id}`,
};

export function dqAreaKey(area: string): string | null {
    return AREA_KEYS[area] ?? null;
}

export function dqSeverityKey(severity: string): string | null {
    return SEVERITY_KEYS[severity] ?? null;
}

export function isFinding(check: IctDqCheck): boolean {
    return check.status === DQ_STATUS_FINDING;
}

export function violatingRowPath(row: IctDqViolatingRow): string | null {
    const build = ROUTE_PATHS[row.route_entity_type];
    return build ? build(row.route_entity_id) : null;
}

export function filterChecks(checks: IctDqCheck[], filter: DqStatusFilter): IctDqCheck[] {
    if (filter === 'findings') {
        return checks.filter(isFinding);
    }
    return checks;
}

export interface DqSummary {
    total: number;
    findings: number;
    ok: number;
    violatingRowCount: number;
}

export function summarizeChecks(checks: IctDqCheck[]): DqSummary {
    const findings = checks.filter(isFinding);
    return {
        total: checks.length,
        findings: findings.length,
        ok: checks.length - findings.length,
        violatingRowCount: findings.reduce((sum, check) => sum + check.count, 0),
    };
}
