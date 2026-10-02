import { motion } from 'framer-motion';
import { Building2, Link as LinkIcon, Star, Tag, User } from 'lucide-react';
import type { ReactNode } from 'react';

import { UserAvatar } from '@/components/access/UserAvatar';
import { RiskTypeBadge } from '@/components/ui/RiskTypeBadge';
import { CardHeader } from '@/components/ui/card';
import { useTranslation } from '@/i18n/hooks';
import type { Risk } from '@/types/risk';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 },
    },
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
};

interface RiskSummaryCardsProps {
    risk: Risk;
    activeControlCount: number | null;
    linkedKriCount: number;
    linkedVendorCount: number | null;
    getColor: (type: string) => string;
    getDisplayName: (type: string) => string;
    children?: ReactNode;
}

export function RiskSummaryCards({
    risk,
    activeControlCount,
    linkedKriCount,
    linkedVendorCount,
    getColor,
    getDisplayName,
    children,
}: RiskSummaryCardsProps) {
    const { t } = useTranslation(['risks', 'common']);
    const typeColor = getColor(risk.risk_type);

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
            <motion.div variants={item} className="glass-card flex flex-col gap-6">
                <CardHeader icon={Tag} title={t('overview.classification', { ns: 'risks' })} className="mb-0 border-b border-border pb-4" />

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-eyebrow">{t('common:labels.type')}</span>
                        <RiskTypeBadge testId="risk-type-badge" label={getDisplayName(risk.risk_type)} color={typeColor} />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-eyebrow">{t('common:labels.category')}</span>
                        <span className="text-sm text-foreground font-medium">{risk.category || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-eyebrow">{t('common:labels.process')}</span>
                        <span className="text-sm text-foreground font-medium">{risk.process}</span>
                    </div>
                    {risk.subprocess && (
                        <div className="flex justify-between items-center">
                            <span className="text-eyebrow">{t('overview.subprocess', { ns: 'risks' })}</span>
                            <span className="text-sm text-muted-foreground font-medium">{risk.subprocess}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center">
                        <span className="text-eyebrow">{t('fields.is_priority', { ns: 'risks' })}</span>
                        <span className={`flex items-center gap-1 text-sm font-bold ${risk.is_priority ? 'text-warning-text' : 'text-muted-foreground'}`}>
                            {risk.is_priority ? <><Star className="h-3 w-3 fill-warning-text" /> {t('common:actions.yes')}</> : t('common:actions.no')}
                        </span>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={item} className="glass-card flex flex-col gap-6">
                <CardHeader icon={User} title={t('overview.ownership', { ns: 'risks' })} className="mb-0 border-b border-border pb-4" />

                <div className="space-y-5">
                    <div className="flex gap-3 items-start">
                        {/* GAP-D-27: the one avatar recipe (no hard-coded 'U' fallback). */}
                        <UserAvatar name={risk.owner?.name} className="h-8 w-8 text-xs" />
                        <div>
                            <p className="text-eyebrow">{t('fields.owner', { ns: 'risks' })}</p>
                            <p className="text-sm font-bold text-foreground leading-snug">{risk.owner?.name || t('common:fallbacks.unassigned')}</p>
                            <p className="text-xs text-muted-foreground">{risk.owner?.email || ''}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-tint/5 border border-border flex items-center justify-center text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-eyebrow">{t('common:labels.department')}</p>
                            <p className="text-sm font-bold text-foreground leading-snug">{risk.department?.name || t('overview.no_department', { ns: 'risks' })}</p>
                            <p className="text-xs text-muted-foreground font-mono">{risk.department?.code || ''}</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={item} className="glass-card flex flex-col gap-6">
                <CardHeader icon={LinkIcon} title={t('overview.connections', { ns: 'risks' })} className="mb-0 border-b border-border pb-4" />

                <div className="space-y-4">
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-eyebrow">
                            {t('overview.mitigating_controls', { ns: 'risks' })}
                        </span>
                        <span className="text-lg text-foreground font-bold tabular-nums">{activeControlCount ?? '—'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-eyebrow">
                            {t('overview.risk_appetite_indicators', { ns: 'risks' })}
                        </span>
                        <span className="text-lg text-foreground font-bold tabular-nums">{linkedKriCount}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-eyebrow">
                            {t('overview.linked_vendors', { ns: 'risks' })}
                        </span>
                        <span className="text-lg text-foreground font-bold tabular-nums">{linkedVendorCount ?? '—'}</span>
                    </div>
                </div>
            </motion.div>

            {children}
        </motion.div>
    );
}
