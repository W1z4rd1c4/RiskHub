import { RemediationPlanCard } from './RemediationPlanCard';
import type { Issue } from '@/types/issue';

interface IssueDetailPanelProps {
    issue: Issue | null;
    canWrite: boolean;
    canApprove: boolean;
    onIssueUpdated: (issue: Issue) => void;
}

function formatDate(value: string | null): string {
    if (!value) {
        return 'N/A';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleString();
}

function renderLinkSummary(issue: Issue): string {
    if (issue.links.length === 0) {
        return 'No linked entities';
    }
    const parts = issue.links.map((link) => {
        if (link.risk_id) {
            return `Risk #${link.risk_id}`;
        }
        if (link.control_id) {
            return `Control #${link.control_id}`;
        }
        if (link.execution_id) {
            return `Execution #${link.execution_id}`;
        }
        if (link.kri_id) {
            return `KRI #${link.kri_id}`;
        }
        return 'Unknown link';
    });
    return parts.join(', ');
}

export function IssueDetailPanel({ issue, canWrite, canApprove, onIssueUpdated }: IssueDetailPanelProps) {
    if (!issue) {
        return (
            <section className="glass-card p-6">
                <h3 className="text-lg font-bold text-white">Issue Detail</h3>
                <p className="mt-2 text-sm text-slate-400">Select an issue to see remediation workflow and linked context.</p>
            </section>
        );
    }

    return (
        <div className="space-y-4">
            <section className="glass-card p-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-white">{issue.title}</h3>
                        <p className="text-sm text-slate-400">Issue #{issue.id}</p>
                    </div>
                    <div className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300">
                        {issue.status}
                    </div>
                </div>
                <p className="text-sm text-slate-300">{issue.description || 'No description.'}</p>
                <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-2">
                    <div>Severity: <span className="text-slate-200">{issue.severity}</span></div>
                    <div>Source: <span className="text-slate-200">{issue.source_type}</span></div>
                    <div>Owner ID: <span className="text-slate-200">{issue.owner_user_id ?? 'Unassigned'}</span></div>
                    <div>Department ID: <span className="text-slate-200">{issue.department_id}</span></div>
                    <div>Opened: <span className="text-slate-200">{formatDate(issue.opened_at)}</span></div>
                    <div>Due: <span className="text-slate-200">{formatDate(issue.due_at)}</span></div>
                    <div className="md:col-span-2">Links: <span className="text-slate-200">{renderLinkSummary(issue)}</span></div>
                </div>
            </section>

            <RemediationPlanCard
                issue={issue}
                canWrite={canWrite}
                canApprove={canApprove}
                onIssueUpdated={onIssueUpdated}
            />

            <section className="glass-card p-6">
                <h4 className="text-sm font-bold uppercase tracking-wide text-slate-300">Exceptions Timeline</h4>
                {issue.exceptions.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No exceptions recorded.</p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {issue.exceptions
                            .slice()
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((exception) => (
                                <li
                                    key={exception.id}
                                    className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-300"
                                >
                                    <div className="font-semibold text-slate-200">{exception.status}</div>
                                    <div>{exception.reason}</div>
                                    <div className="text-slate-500">Expires: {formatDate(exception.expires_at)}</div>
                                </li>
                            ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
