import { useTranslation } from '@/i18n/hooks';
import {
    ISSUE_CARD,
    ISSUE_LABEL,
    formatIssueToken,
    issuePill,
    issueSeverityClass,
    issueStatusClass,
} from './issueUi';
import { RemediationPlanCard } from './RemediationPlanCard';
import type { Issue } from '@/types/issue';

interface IssueDetailPanelProps {
    issue: Issue | null;
    canWrite: boolean;
    canApprove: boolean;
    onIssueUpdated: (issue: Issue) => void;
}

function formatDate(value: string | null, locale: string, notSetLabel: string): string {
    if (!value) {
        return notSetLabel;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}

function renderLinkSummary(issue: Issue, t: (key: string, fallback?: string) => string): string {
    if (issue.links.length === 0) {
        return t('detail.messages.no_linked_entities', 'No linked entities.');
    }
    const parts = issue.links.map((link) => {
        if (link.linked_entity_name && link.linked_entity_name.trim()) {
            return link.linked_entity_name;
        }
        if (link.linked_entity_type === 'risk' || link.risk_id) {
            return t('fallbacks.unknown_risk', 'Unknown risk');
        }
        if (link.linked_entity_type === 'control' || link.control_id) {
            return t('fallbacks.unknown_control', 'Unknown control');
        }
        if (link.linked_entity_type === 'execution' || link.execution_id) {
            return t('fallbacks.unknown_execution', 'Unknown execution');
        }
        if (link.linked_entity_type === 'kri' || link.kri_id) {
            return t('fallbacks.unknown_kri', 'Unknown KRI');
        }
        return t('fallbacks.unknown_link', 'Unknown link');
    });
    return parts.join(', ');
}

function MetaItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <p className={ISSUE_LABEL}>{label}</p>
            <p className="text-sm text-slate-300 break-words">{value}</p>
        </div>
    );
}

export function IssueDetailPanel({ issue, canWrite, canApprove, onIssueUpdated }: IssueDetailPanelProps) {
    const { t, i18n } = useTranslation('issues');

    if (!issue) {
        return (
            <section className={ISSUE_CARD}>
                <h3 className="text-lg font-bold text-white">{t('title', 'Issues')}</h3>
                <p className="text-sm text-slate-400">{t('detail.messages.select_issue', 'Select an issue to see remediation workflow and linked context.')}</p>
            </section>
        );
    }

    return (
        <div className="space-y-6">
            <section className={ISSUE_CARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-white leading-tight">{issue.title}</h3>
                        <p className="text-sm text-slate-300">{issue.description || t('fallbacks.no_description', 'No description.')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={issuePill(issueStatusClass(issue.status))}>{t(`status.${issue.status}`, formatIssueToken(issue.status))}</span>
                        <span className={issuePill(issueSeverityClass(issue.severity))}>{t(`severity.${issue.severity}`, formatIssueToken(issue.severity))}</span>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetaItem label={t('detail.fields.source', 'Source')} value={t(`source.${issue.source_type}`, formatIssueToken(issue.source_type))} />
                    <MetaItem
                        label={t('detail.fields.owner', 'Owner')}
                        value={issue.owner_user_name || (issue.owner_user_id ? t('fallbacks.unknown_user', 'Unknown user') : t('fallbacks.unassigned', 'Unassigned'))}
                    />
                    <MetaItem label={t('detail.fields.department', 'Department')} value={issue.department_name || t('fallbacks.unknown_department', 'Unknown department')} />
                    <MetaItem label={t('detail.fields.opened', 'Opened')} value={formatDate(issue.opened_at, i18n.language, t('fallbacks.not_set', 'Not set'))} />
                    <MetaItem label={t('detail.fields.due', 'Due')} value={formatDate(issue.due_at, i18n.language, t('fallbacks.not_set', 'Not set'))} />
                    <MetaItem label={t('detail.fields.created_by', 'Created by')} value={issue.created_by_name || t('fallbacks.unknown_user', 'Unknown user')} />
                    <div className="md:col-span-2 xl:col-span-3">
                        <MetaItem label={t('detail.fields.links', 'Links')} value={renderLinkSummary(issue, t)} />
                    </div>
                </div>
            </section>

            <RemediationPlanCard
                issue={issue}
                canWrite={canWrite}
                canApprove={canApprove}
                onIssueUpdated={onIssueUpdated}
            />

            <section className={ISSUE_CARD}>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.sections.exceptions', 'Exceptions')}</h4>
                {issue.exceptions.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('detail.messages.no_exceptions', 'No exceptions recorded.')}</p>
                ) : (
                    <ul className="space-y-3">
                        {issue.exceptions
                            .slice()
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((exception) => (
                                <li
                                    key={exception.id}
                                    className="rounded-xl border border-white/10 bg-slate-900/40 p-4 space-y-2"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-300">
                                            {t(`exception_status.${exception.status}`, formatIssueToken(exception.status))}
                                        </span>
                                        <span className="text-xs text-slate-500">{t('detail.messages.expires', 'Expires')}: {formatDate(exception.expires_at, i18n.language, t('fallbacks.not_set', 'Not set'))}</span>
                                    </div>
                                    <p className="text-sm text-slate-300">{exception.reason}</p>
                                </li>
                            ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
