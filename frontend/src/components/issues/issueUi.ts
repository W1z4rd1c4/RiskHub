import { ISSUE_SEVERITY_BAND, severityClass } from '@/lib/severity';
import { cn } from '@/lib/utils';
import type { IssueSeverity, IssueStatus } from '@/types/issue';

export const ISSUE_CARD = 'glass-card p-6 space-y-5';
export const ISSUE_SECTION_CARD = 'glass-card p-6 space-y-5';
export const ISSUE_SECTION_HEADER = 'flex flex-wrap items-center justify-between gap-3';
export const ISSUE_SECTION_TITLE = 'text-base font-black text-foreground tracking-tight';
export const ISSUE_SECTION_SUBTITLE = 'text-xs font-medium text-muted-foreground';
export const ISSUE_LABEL = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';
export const ISSUE_FIELD =
    'w-full bg-tint/5 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent/50 transition-colors';
export const ISSUE_TEXTAREA = `${ISSUE_FIELD} min-h-[104px] resize-y`;
export const ISSUE_ACTION_ROW = 'flex flex-wrap items-center gap-2 pt-1';

export const ISSUE_PRIMARY_BUTTON =
    'rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_SECONDARY_BUTTON =
    'rounded-xl border border-tint/20 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-tint/5 disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_WARNING_BUTTON =
    'rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm font-semibold text-warning-text transition-colors hover:bg-warning/20 disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_SUCCESS_BUTTON =
    'rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success-text transition-colors hover:bg-success/20 disabled:opacity-50 disabled:cursor-not-allowed';

export function formatIssueToken(value: string): string {
    return value
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function issueStatusClass(status: IssueStatus): string {
    switch (status) {
        case 'open':
            return 'border-warning/40 bg-warning/10 text-warning-text';
        case 'triaged':
            return 'border-info/40 bg-info/10 text-accent-text';
        case 'in_progress':
            return 'border-accent/40 bg-accent/10 text-accent-text';
        case 'ready_for_validation':
            return 'border-accent/40 bg-accent/10 text-accent-text';
        case 'closed':
            return 'border-success/40 bg-success/10 text-success-text';
        default:
            return 'border-border bg-muted text-muted-foreground';
    }
}

/** D1: issue severity pills use the single severity scale (`lib/severity.ts`). */
export function issueSeverityClass(severity: IssueSeverity): string {
    const band = ISSUE_SEVERITY_BAND[severity];
    return band ? severityClass('badge', band) : 'border-border bg-muted text-muted-foreground';
}

export function issuePill(baseClass: string): string {
    return cn('rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', baseClass);
}
