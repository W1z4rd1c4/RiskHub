import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { useFormat, type SafeTFunction } from '@/i18n/hooks';
import type { Issue } from '@/types/issue';

import { IssueMetaBlock } from './IssueMetaBlock';
import { exceptionActorName, linkedEntityHref } from './issueDetail.formatters';

interface IssueOverviewTabProps {
    issue: Issue;
    sourceLabel: (sourceType: string) => string;
    t: SafeTFunction;
}

export function IssueOverviewTab({ issue, sourceLabel, t }: IssueOverviewTabProps) {
    const format = useFormat();
    const formatDateTime = (value: string | null) => format.dateTime(value) || t('common:fallbacks.not_set');
    return (
        <section className="space-y-5" data-testid="issue-overview-panel">
            <Card as="section" className="space-y-4">
                <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <IssueMetaBlock
                        label={t('detail.fields.source')}
                        value={issue.source_display || sourceLabel(issue.source_type)}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.owner')}
                        value={issue.owner_user_name || t('common:fallbacks.unassigned')}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.department')}
                        value={issue.department_name || t('common:fallbacks.unknown_department')}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.opened')}
                        value={formatDateTime(issue.opened_at)}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.due')}
                        value={formatDateTime(issue.due_at)}
                    />
                    <IssueMetaBlock
                        label={t('detail.fields.created_by')}
                        value={issue.created_by_name || t('common:fallbacks.unknown_user')}
                    />
                </dl>
            </Card>

            <Card as="section" className="space-y-5">
                <div className="space-y-3">
                    <CardTitle as="h2">
                        {t('detail.sections.linked_entities')}
                    </CardTitle>
                    {issue.links.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('detail.messages.no_linked_entities')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {issue.links.map((link) => (
                                <li
                                    key={link.id}
                                    className="rounded-xl border border-border bg-nested px-4 py-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        {/* I18N-01 remainder: linked entities are links, with translated fallbacks only. */}
                                        {link.linked_entity_name && linkedEntityHref(link) ? (
                                            <Link to={linkedEntityHref(link) ?? '#'} className="text-sm font-medium text-accent-text underline-offset-4 hover:underline">
                                                {link.linked_entity_name}
                                            </Link>
                                        ) : (
                                            <p className="text-sm text-foreground">
                                                {link.linked_entity_name ||
                                                    (link.linked_entity_type
                                                        ? t(`fallbacks.unknown_${link.linked_entity_type}`, t('fallbacks.unknown_link'))
                                                        : t('fallbacks.unknown_link'))}
                                            </p>
                                        )}
                                        {link.is_source_link ? (
                                            <Badge size="sm" tone="accent">
                                                {t('detail.fields.source')}
                                            </Badge>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="space-y-3">
                    <CardTitle as="h2">
                        {t('detail.sections.exceptions')}
                    </CardTitle>
                    {issue.exceptions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('detail.messages.no_exceptions')}</p>
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
                                        className="rounded-xl border border-border bg-nested px-4 py-3 space-y-1.5"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-foreground">
                                                {t(`exception_status.${exception.status}`, exception.status)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {t('common:labels.label_value', {
                                                    label: t('detail.messages.expires'),
                                                    value: formatDateTime(exception.expires_at),
                                                })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-foreground">{exception.reason}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {exceptionActorName(
                                                exception.requested_by_name,
                                                exception.approved_by_name,
                                                t('common:fallbacks.unknown_user'),
                                            )}
                                        </p>
                                    </li>
                                ))}
                        </ul>
                    )}
                </div>
            </Card>
        </section>
    );
}
