import { cn } from '@/lib/utils';
import type { IssueSeverity, IssueStatus } from '@/types/issue';

export const ISSUE_CARD = 'glass-card p-6 space-y-5';
export const ISSUE_SECTION_CARD = 'glass-card p-6 space-y-5';
export const ISSUE_SECTION_HEADER = 'flex flex-wrap items-center justify-between gap-3';
export const ISSUE_SECTION_TITLE = 'text-base font-black text-white tracking-tight';
export const ISSUE_SECTION_SUBTITLE = 'text-xs font-medium text-slate-500';
export const ISSUE_LABEL = 'text-xs font-bold uppercase tracking-widest text-slate-500';
export const ISSUE_FIELD =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50 transition-all';
export const ISSUE_TEXTAREA = `${ISSUE_FIELD} min-h-[104px] resize-y`;
export const ISSUE_ACTION_ROW = 'flex flex-wrap items-center gap-2 pt-1';

export const ISSUE_PRIMARY_BUTTON =
    'rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_SECONDARY_BUTTON =
    'rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_WARNING_BUTTON =
    'rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed';
export const ISSUE_SUCCESS_BUTTON =
    'rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed';

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
            return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
        case 'triaged':
            return 'border-sky-400/40 bg-sky-500/10 text-sky-200';
        case 'in_progress':
            return 'border-indigo-400/40 bg-indigo-500/10 text-indigo-200';
        case 'ready_for_validation':
            return 'border-violet-400/40 bg-violet-500/10 text-violet-200';
        case 'closed':
            return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200';
        default:
            return 'border-white/15 bg-white/5 text-slate-300';
    }
}

export function issueSeverityClass(severity: IssueSeverity): string {
    switch (severity) {
        case 'critical':
            return 'border-rose-400/40 bg-rose-500/10 text-rose-200';
        case 'high':
            return 'border-orange-400/40 bg-orange-500/10 text-orange-200';
        case 'medium':
            return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
        case 'low':
            return 'border-sky-400/40 bg-sky-500/10 text-sky-200';
        default:
            return 'border-white/15 bg-white/5 text-slate-300';
    }
}

export function issuePill(baseClass: string): string {
    return cn('rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', baseClass);
}
