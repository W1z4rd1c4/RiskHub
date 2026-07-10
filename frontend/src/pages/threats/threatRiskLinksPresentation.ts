import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ThreatRiskLink } from '@/types/threat';

/** Parse the risk-select value into the link's other-end id (null = no payload). */
export function parseLinkTargetId(rawValue: string): number | null {
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

/** Per-row remove gating comes from the backend capability, never local policy. */
export function canDeleteThreatRiskLink(link: ThreatRiskLink): boolean {
    return resolveCapabilityFlag(link.capabilities, 'can_delete');
}

/** Options for the link-add select: active, not already linked. */
export function buildLinkTargetOptions(
    candidates: Array<{ id: number; label: string; isArchived: boolean }>,
    linkedIds: ReadonlySet<number>,
): Array<{ value: string; label: string }> {
    return candidates
        .filter((candidate) => !candidate.isArchived && !linkedIds.has(candidate.id))
        .map((candidate) => ({ value: String(candidate.id), label: candidate.label }));
}
