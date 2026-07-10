import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { RiskAssetLink, RiskProcessLink, ThreatRiskLink } from '@/types/threat';

type RegisterLinkRow = ThreatRiskLink | RiskProcessLink | RiskAssetLink;

/** Parse the target select value into the link's other-end id (null = no payload). */
export function parseRegisterLinkTargetId(rawValue: string): number | null {
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

/** Per-row remove gating comes from the backend capability, never local policy. */
export function canDeleteRegisterLink(link: RegisterLinkRow): boolean {
    return resolveCapabilityFlag(link.capabilities, 'can_delete');
}

/** Options for a link-add select: active targets not already linked. */
export function buildRegisterLinkOptions(
    candidates: Array<{ id: number; label: string; isArchived: boolean }>,
    linkedIds: ReadonlySet<number>,
): Array<{ value: string; label: string }> {
    return candidates
        .filter((candidate) => !candidate.isArchived && !linkedIds.has(candidate.id))
        .map((candidate) => ({ value: String(candidate.id), label: candidate.label }));
}
