import type { Process } from '@/types/process';

export interface ProcessProtectionCandidate {
    cif_override: string;
    preliminary_criticality: string;
    mtpd_hours: string;
    impact_client: string;
    impact_market_operations: string;
    impact_regulatory: string;
    impact_financial: string;
}

function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Identifies the protection states the browser can prove from the Process
 * projection. The API remains authoritative because a disabled scenario and
 * server-side parameter changes can alter the final routing decision.
 */
export function processEditNeedsRequestReason(
    process: Process,
    candidate: ProcessProtectionCandidate,
): boolean {
    if (process.derived?.cif === 'yes') return true;

    const override = candidate.cif_override.trim();
    if (override === 'yes') return true;
    if (override === 'no') return false;

    const impactAxes = [
        candidate.impact_client,
        candidate.impact_market_operations,
        candidate.impact_regulatory,
        candidate.impact_financial,
    ].map(optionalNumber);
    if (impactAxes.some((value) => value === 5)) return true;

    const mtpdHours = optionalNumber(candidate.mtpd_hours);
    const criticalHours = process.derived?.inputs.mtpd_critical_hours;
    if (mtpdHours !== null && criticalHours !== undefined && mtpdHours <= criticalHours) return true;

    return candidate.preliminary_criticality === 'critical'
        && impactAxes.some((value) => value === null);
}
