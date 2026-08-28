import { cn } from '@/lib/utils';
import type { IssueSeverity, IssueStatus } from '@/types/issue';

export const ISSUE_CARD = 'glass-card p-6 space-y-5';
export const ISSUE_SECTION_CARD = 'glass-card p-6 space-y-5';
export const ISSUE_SECTION_HEADER = 'flex flex-wrap items-center justify-between gap-3';
export const ISSUE_SECTION_TITLE = 'text-base font-black text-white tracking-tight';
export const ISSUE_SECTION_SUBTITLE = 'text-xs font-medium text-slate-500';
export const ISSUE_LABEL = 'text-xs font-bold uppercase tracking-widest text-slate-500';
export const ISSUE_FIELD =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50 transition-colors';
export const ISSUE_TEXTAREA = `${ISSUE_FIELD} min-h-[104px] resize-y`;
export const ISSUE_ACTION_ROW = 'flex flex-wrap items-center gap-2 pt-1';

export const ISSUE_PRIMARY_BUTTON =
    'rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_SECONDARY_BUTTON =
    'rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed';
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

export function issueSeverityClass(severity: IssueSeverity): string {
    switch (severity) {
        case 'critical':
            return 'border-destructive/40 bg-destructive/10 text-destructive';
        case 'high':
            return 'border-destructive/40 bg-destructive/10 text-destructive';
        case 'medium':
            return 'border-warning/40 bg-warning/10 text-warning-text';
        case 'low':
            return 'border-info/40 bg-info/10 text-accent-text';
        default:
            return 'border-border bg-muted text-muted-foreground';
    }
}

export function issuePill(baseClass: string): string {
    return cn('rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', baseClass);
}
