import type { Process } from '@/types/process';
import { resolveCapabilityFlag } from '@/lib/capabilities';

export interface ProcessProtectionCandidate {
    cif_override: string;
    preliminary_criticality: string;
    mtpd_hours: string;
    impact_client: string;
    impact_market_operations: string;
    impact_regulatory: string;
    impact_financial: string;
}

/**
 * Existing-row archive/link actions need a reason only when the server's live
 * scenario is enabled and the projected Process is protected. Unknown rows
 * fail closed so the API can still enforce a protected mutation.
 */
export function processMutationRequiresApprovalReason(
    process: Process | null | undefined,
): boolean {
    if (!process) return true;
    if (
        process.capabilities
        && !resolveCapabilityFlag(process.capabilities, 'protected_change_requires_approval')
    ) return false;
    if (process.derived?.cif === 'no') return false;
    return true;
}

/** The API projection is authoritative for active governed-mutation impact locks. */
export function processBusinessEditBlocked(process: Process | null | undefined): boolean {
    return process?.capabilities?.business_edit_blocked === true;
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
