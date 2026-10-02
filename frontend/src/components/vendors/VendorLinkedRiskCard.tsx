import { ArrowUpRight, Star } from 'lucide-react';

import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RiskTypeBadge } from '@/components/ui/RiskTypeBadge';
import { useRiskTypes, useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import type { LinkedRisk } from '@/types/vendorLink';

interface VendorLinkedRiskCardProps {
    risk: LinkedRisk;
    /** Card of the archived group: carries an Archived badge instead of a dimmed group (GAP-D-14). */
    archived?: boolean;
    onClick?: () => void;
}

/**
 * A linked risk on the vendor page. The title button stretches over the whole
 * card (`after:inset-0`), so the card is one keyboard-reachable control named
 * by the risk code and name; the scores are D1 severity badges under the
 * configured thresholds (ADR-008).
 */
export function VendorLinkedRiskCard({ risk, archived = false, onClick }: VendorLinkedRiskCardProps) {
    const { t } = useTranslation(['common', 'risks']);
    const { getColor, getDisplayName } = useRiskTypes();
    const { getSeverityBand } = useRiskThresholds();
    const riskType = risk.risk_type || 'operational';
    const riskTypeColor = getColor(riskType);
    const grossScore = risk.gross_score ?? 0;
    const netScore = risk.net_score ?? 0;
    const title = `${risk.risk_id_code}: ${risk.name}`;

    return (
        <Card as="article" padding="compact" interactive className="group relative flex h-full flex-col p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <RiskTypeBadge label={getDisplayName(riskType)} color={riskTypeColor} />
                        {risk.is_priority ? (
                            <Badge tone="warning" icon={Star}>{t('risks:fields.is_priority')}</Badge>
                        ) : null}
                        {archived ? <Badge tone="neutral">{t('risks:status.archived')}</Badge> : null}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground" title={title}>
                        <Button
                            variant={null}
                            size={null}
                            onClick={onClick}
                            className="inline h-auto whitespace-normal p-0 text-left text-sm font-bold text-foreground after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-accent-text"
                        >
                            {title}
                        </Button>
                    </h3>
                </div>
                <div
                    aria-hidden="true"
                    className="shrink-0 rounded-xl border border-border bg-nested p-2 text-muted-foreground transition-colors group-hover:border-accent/30 group-hover:text-accent-text"
                >
                    <ArrowUpRight className="h-4 w-4" />
                </div>
            </div>

            <div className="mt-auto space-y-4">
                <div className="flex flex-wrap gap-2">
                    <SeverityBadge
                        band={getSeverityBand(grossScore)}
                        label={`${t('common:labels.gross')}: ${grossScore}`}
                    />
                    <SeverityBadge
                        band={getSeverityBand(netScore)}
                        label={`${t('common:labels.net')}: ${netScore}`}
                    />
                </div>

                <dl className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <dt className="text-eyebrow">{t('common:labels.process')}</dt>
                        <dd className="truncate text-xs font-semibold text-foreground">{risk.process}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <dt className="text-eyebrow">{t('common:labels.department')}</dt>
                        <dd className="truncate text-xs font-semibold text-foreground">
                            {risk.department_name || t('common:fallbacks.not_available')}
                        </dd>
                    </div>
                    {risk.category ? (
                        <div className="flex items-center justify-between gap-3">
                            <dt className="text-eyebrow">{t('common:labels.category')}</dt>
                            <dd className="truncate text-xs font-semibold text-foreground">{risk.category}</dd>
                        </div>
                    ) : null}
                </dl>
            </div>
        </Card>
    );
}
