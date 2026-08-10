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

/**
 * Row name from the server-embedded display field. Never a raw id: an
 * unresolved end renders the i18n'd unknown label
 * (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
 */
export function registerLinkRowName(
    serverName: string | null | undefined,
    unknownLabel: string,
): string {
    return serverName ?? unknownLabel;
}

/** Options for a link-add select: active targets not already linked. */
export function buildRegisterLinkOptions(
    candidates: Array<{ id: number; label: string; isArchived: boolean; disabled?: boolean }>,
    linkedIds: ReadonlySet<number>,
): Array<{ value: string; label: string; disabled?: boolean }> {
    return candidates
        .filter((candidate) => !candidate.isArchived && !linkedIds.has(candidate.id))
        .map((candidate) => ({
            value: String(candidate.id),
            label: candidate.label,
            ...(candidate.disabled === undefined ? {} : { disabled: candidate.disabled }),
        }));
}
