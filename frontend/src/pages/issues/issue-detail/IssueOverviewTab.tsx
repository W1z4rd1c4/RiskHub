import type { SafeTFunction } from '@/i18n/hooks';
import type { Issue } from '@/types/issue';

import { IssueMetaBlock } from './IssueMetaBlock';
import { exceptionActorName, formatDateTime } from './issueDetail.formatters';

interface IssueOverviewTabProps {
    issue: Issue;
    locale: string;
    sourceLabel: (sourceType: string) => string;
    t: SafeTFunction;
}

export function IssueOverviewTab({ issue, locale, sourceLabel, t }: IssueOverviewTabProps) {
    return (
        <section className="space-y-5" data-testid="issue-overview-panel">
            <section className="glass-card p-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <IssueMetaBlock
                        label={t('detail.fields.source')}
                        value={issue.source_display || sourceLabel(issue.source_type)}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.owner')}
                        value={issue.owner_user_name || t('fallbacks.unassigned')}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.department')}
                        value={issue.department_name || t('fallbacks.unknown_department')}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.opened')}
                        value={formatDateTime(issue.opened_at, locale, t('fallbacks.not_set'))}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.due')}
                        value={formatDateTime(issue.due_at, locale, t('fallbacks.not_set'))}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.created_by')}
                        value={issue.created_by_name || t('fallbacks.unknown_user')}
                    />
                </div>
            </section>

            <section className="glass-card p-6 space-y-5">
                <div className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                        {t('detail.sections.linked_entities')}
                    </h3>
                    {issue.links.length === 0 ? (
                        <p className="text-sm text-slate-400">{t('detail.messages.no_linked_entities')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {issue.links.map((link) => (
                                <li
                                    key={link.id}
                                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm text-slate-300">
                                            {link.linked_entity_name ||
                                                (link.linked_entity_type
                                                    ? t(
                                                          `fallbacks.unknown_${link.linked_entity_type}`,
                                                          `Unknown ${link.linked_entity_type}`,
                                                      )
                                                    : t('fallbacks.unknown_link'))}
                                        </p>
                                        {link.is_source_link ? (
                                            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                                                {t('detail.fields.source')}
                                            </span>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                        {t('detail.sections.exceptions')}
                    </h3>
                    {issue.exceptions.length === 0 ? (
                        <p className="text-sm text-slate-400">{t('detail.messages.no_exceptions')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {issue.exceptions
                                .slice()
                                .sort(
                                    (a, b) =>
                                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                                )
                                .map((exception) => (
                                    <li
                                        key={exception.id}
                                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-1.5"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-slate-300">
                                                {t(`exception_status.${exception.status}`, exception.status)}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {t('detail.messages.expires')}:{' '}
                                                {formatDateTime(
                                                    exception.expires_at,
                                                    locale,
                                                    t('fallbacks.not_set'),
                                                )}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-300">{exception.reason}</p>
                                        <p className="text-xs text-slate-500">
                                            {exceptionActorName(
                                                exception.requested_by_name,
                                                exception.approved_by_name,
                                                t('fallbacks.unknown_user'),
                                            )}
                                        </p>
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>
            </section>
        </section>
    );
}
