import type { RecentLogEntry } from '@/services/adminApi';
import { formatDateTimeValue } from '@/i18n/formatters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

import { formatAuditEvent, formatAuditUser, getAuditEventTone } from './auditPresentation';

interface AuditLogsTableProps {
    logs: RecentLogEntry[];
    /** Accessible name of the scrollable table region. */
    regionLabel: string;
    language: string;
    resolveUserName?: (userId: number) => string | null | undefined;
    t: (key: string, options?: Record<string, unknown>) => string;
    onViewDetails: (extra: Record<string, unknown>) => void;
}

export function AuditLogsTable({ logs, regionLabel, language, resolveUserName, t, onViewDetails }: AuditLogsTableProps) {
    return (
        <Table
            density="compact"
            regionLabel={regionLabel}
            containerClassName="rounded-xl border border-border"
            className="text-sm text-left"
        >
            <THead>
                <TR>
                    <TH>{t('audit.columns.timestamp')}</TH>
                    <TH>{t('audit.columns.event')}</TH>
                    <TH>{t('audit.columns.user')}</TH>
                    <TH>{t('audit.columns.client_ip')}</TH>
                    <TH align="right">{t('audit.columns.details')}</TH>
                </TR>
            </THead>
            <TBody>
                {logs.length === 0 ? (
                    <TR>
                        <TD colSpan={5} className="p-0">
                            <EmptyState layout="section" title={t('audit.no_events')} className="py-8" />
                        </TD>
                    </TR>
                ) : (
                    logs.map((log, index) => (
                        <TR key={`${log.timestamp}-${index}`}>
                            <TD className="whitespace-nowrap text-muted-foreground">
                                {log.timestamp ? formatDateTimeValue(log.timestamp, language) : t('common:fallbacks.not_available')}
                            </TD>
                            <TD>
                                <Badge shape="rounded" tone={getAuditEventTone(log.event)}>
                                    {formatAuditEvent(log.event, t('common:fallbacks.unknown'), t)}
                                </Badge>
                            </TD>
                            <TD className="font-medium text-foreground">
                                {formatAuditUser(
                                    log.user_id,
                                    t('common:fallbacks.system'),
                                    t('common:fallbacks.unknown_user'),
                                    resolveUserName,
                                )}
                            </TD>
                            <TD className="font-mono text-xs text-muted-foreground">
                                {log.client_ip || t('common:fallbacks.not_available')}
                            </TD>
                            <TD align="right">
                                <Button
                                    type="button"
                                    variant="link"
                                    size="compact"
                                    className="text-accent-text"
                                    onClick={() => onViewDetails(log.extra || {})}
                                >
                                    {t('audit.view')}
                                </Button>
                            </TD>
                        </TR>
                    ))
                )}
            </TBody>
        </Table>
    );
}
