import { Building2, Shield, User, type LucideIcon } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { useRiskTypeLabel } from '@/pages/risks/useRiskTypeLabel';
import type { CollectionGroup } from '@/types/collection';

/**
 * Risk context under a "grouped by risk" register group card (Controls,
 * KRIs; audit PG-31): the risk type (its display name, as on the Risk
 * register), department and owner of the group's risk.
 * The card is a button, so the body is phrasing content (spans); each value
 * carries its field name as a tooltip.
 */
export function RiskGroupMetaBody({ group }: { group: CollectionGroup }) {
    const { t } = useTranslation('common');
    const riskTypeLabel = useRiskTypeLabel();
    const riskType = String(group.meta?.risk_type || '');
    const items: Array<{ key: string; icon: LucideIcon; label: string; value: string }> = [
        {
            key: 'risk_type',
            icon: Shield,
            label: t('labels.risk_type'),
            value: riskType ? riskTypeLabel(riskType) : t('fallbacks.unknown_type'),
        },
        {
            key: 'department',
            icon: Building2,
            label: t('labels.department'),
            value: String(group.meta?.risk_department_name || '') || t('fallbacks.unassigned'),
        },
        {
            key: 'owner',
            icon: User,
            label: t('labels.owner'),
            value: String(group.meta?.risk_owner_name || '') || t('fallbacks.no_owner'),
        },
    ];

    return (
        <span className="grid grid-cols-2 gap-y-2 border-b border-border pb-2" data-testid="risk-group-meta">
            {items.map(({ key, icon: Icon, label, value }) => (
                <span key={key} className="flex min-w-0 items-center gap-2" title={t('labels.label_value', { label, value })}>
                    <Icon className="size-3 shrink-0 text-accent-text" aria-hidden="true" />
                    <span className="text-eyebrow truncate">{value}</span>
                </span>
            ))}
        </span>
    );
}
