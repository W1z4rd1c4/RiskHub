import type { IssueLink } from '@/types/issue';

export function exceptionActorName(
    requestedByName: string | null,
    approvedByName: string | null,
    unknownUserLabel: string,
): string {
    if (approvedByName) {
        return approvedByName;
    }
    if (requestedByName) {
        return requestedByName;
    }
    return unknownUserLabel;
}

/** Route of a linked entity's detail page, or `null` when it has none (executions). */
export function linkedEntityHref(link: Pick<IssueLink, 'risk_id' | 'control_id' | 'kri_id' | 'vendor_id'>): string | null {
    if (link.risk_id) return `/risks/${link.risk_id}`;
    if (link.control_id) return `/controls/${link.control_id}`;
    if (link.kri_id) return `/kris/${link.kri_id}`;
    if (link.vendor_id) return `/vendors/${link.vendor_id}`;
    return null;
}
