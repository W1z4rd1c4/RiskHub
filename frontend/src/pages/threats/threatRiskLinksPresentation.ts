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

/**
 * Row label from the server-embedded display fields ("CODE: Name"). Never a
 * raw id: an unresolved Risk end renders the i18n'd unknown label
 * (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
 */
export function threatRiskLinkRowLabel(link: ThreatRiskLink, unknownRiskLabel: string): string {
    if (link.risk_name) {
        return link.risk_id_code ? `${link.risk_id_code}: ${link.risk_name}` : link.risk_name;
    }
    return unknownRiskLabel;
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
