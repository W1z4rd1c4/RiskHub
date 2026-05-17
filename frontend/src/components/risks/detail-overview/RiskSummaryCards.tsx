import { motion } from 'framer-motion';
import { Building2, Link as LinkIcon, Star, Tag, User } from 'lucide-react';
import type { ReactNode } from 'react';

import { RiskTypeBadge } from '@/components/ui/RiskTypeBadge';
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
    activeControlCount: number;
    linkedKriCount: number;
    linkedVendorCount: number;
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
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                    <Tag className="h-5 w-5 text-purple-400" />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.classification', { ns: 'risks' })}</h3>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.type')}</span>
                        <RiskTypeBadge testId="risk-type-badge" label={getDisplayName(risk.risk_type)} color={typeColor} />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.category')}</span>
                        <span className="text-sm text-white font-medium">{risk.category || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.process')}</span>
                        <span className="text-sm text-white font-medium">{risk.process}</span>
                    </div>
                    {risk.subprocess && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('overview.subprocess', { ns: 'risks' })}</span>
                            <span className="text-sm text-slate-300 font-medium">{risk.subprocess}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('fields.is_priority', { ns: 'risks' })}</span>
                        <span className={`flex items-center gap-1 text-sm font-bold ${risk.is_priority ? 'text-amber-400' : 'text-slate-400'}`}>
                            {risk.is_priority ? <><Star className="h-3 w-3 fill-amber-400" /> {t('common:actions.yes')}</> : t('common:actions.no')}
                        </span>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={item} className="glass-card flex flex-col gap-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                    <User className="h-5 w-5 text-accent" />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.ownership', { ns: 'risks' })}</h3>
                </div>

                <div className="space-y-5">
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                            {risk.owner?.name?.[0] || 'U'}
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('fields.owner', { ns: 'risks' })}</p>
                            <p className="text-sm font-bold text-white leading-snug">{risk.owner?.name || t('overview.unassigned', { ns: 'risks' })}</p>
                            <p className="text-xs text-slate-500">{risk.owner?.email || ''}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                            <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('common:labels.department')}</p>
                            <p className="text-sm font-bold text-white leading-snug">{risk.department?.name || t('overview.no_department', { ns: 'risks' })}</p>
                            <p className="text-xs text-slate-500 font-mono">{risk.department?.code || ''}</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={item} className="glass-card flex flex-col gap-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                    <LinkIcon className="h-5 w-5 text-indigo-400" />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.connections', { ns: 'risks' })}</h3>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                            {t('overview.mitigating_controls', { ns: 'risks' })}
                        </span>
                        <span className="text-lg text-white font-black">{activeControlCount}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                            {t('overview.risk_appetite_indicators', { ns: 'risks' })}
                        </span>
                        <span className="text-lg text-white font-black">{linkedKriCount}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                            {t('overview.linked_vendors', { ns: 'risks' })}
                        </span>
                        <span className="text-lg text-white font-black">{linkedVendorCount}</span>
                    </div>
                </div>
            </motion.div>

            {children}
        </motion.div>
    );
}
