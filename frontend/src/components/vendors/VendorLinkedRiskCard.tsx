import { motion } from 'framer-motion';
import { ArrowUpRight, Star } from 'lucide-react';

import { useRiskTypes, useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import type { LinkedRisk } from '@/types/vendorLink';

function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return `rgba(100, 116, 139, ${alpha})`;
    }

    const r = Number.parseInt(result[1], 16);
    const g = Number.parseInt(result[2], 16);
    const b = Number.parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface VendorLinkedRiskCardProps {
    risk: LinkedRisk;
    onClick?: () => void;
}

export function VendorLinkedRiskCard({ risk, onClick }: VendorLinkedRiskCardProps) {
    const { t } = useTranslation(['common', 'risks']);
    const { getColor, getDisplayName } = useRiskTypes();
    const { getScoreBadgeColor } = useRiskThresholds();
    const riskType = risk.risk_type || 'operational';
    const riskTypeColor = getColor(riskType);
    const grossScore = risk.gross_score ?? 0;
    const netScore = risk.net_score ?? 0;

    return (
        <motion.button
            type="button"
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={onClick}
            className="glass-card p-5 text-left group flex flex-col h-full"
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                            style={{
                                color: riskTypeColor,
                                backgroundColor: hexToRgba(riskTypeColor, 0.12),
                            }}
                        >
                            {getDisplayName(riskType)}
                        </span>
                        {risk.is_priority ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-amber-300 bg-amber-400/10 border border-amber-400/20">
                                <Star className="h-3 w-3 fill-amber-300" />
                                {t('risks:fields.is_priority')}
                            </span>
                        ) : null}
                    </div>
                    <h4
                        className="text-white font-bold text-sm leading-tight group-hover:text-accent transition-colors line-clamp-2"
                        title={`${risk.risk_id_code}: ${risk.name}`}
                    >
                        {risk.risk_id_code}: {risk.name}
                    </h4>
                </div>
                <div className="shrink-0 rounded-xl bg-white/5 border border-white/10 p-2 text-slate-500 group-hover:text-accent group-hover:border-accent/30 transition-colors">
                    <ArrowUpRight className="h-4 w-4" />
                </div>
            </div>

            <div className="mt-auto space-y-4">
                <div className="flex flex-wrap gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getScoreBadgeColor(grossScore)}`}>
                        {t('common:labels.gross')}: {grossScore}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getScoreBadgeColor(netScore)}`}>
                        {t('common:labels.net')}: {netScore}
                    </span>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            {t('common:labels.process')}
                        </span>
                        <span className="text-xs text-white font-semibold truncate">
                            {risk.process}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            {t('common:labels.department')}
                        </span>
                        <span className="text-xs text-slate-300 font-semibold truncate">
                            {risk.department_name || t('common:fallbacks.not_available')}
                        </span>
                    </div>
                    {risk.category ? (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                {t('common:labels.category')}
                            </span>
                            <span className="text-xs text-slate-300 font-semibold truncate">
                                {risk.category}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>
        </motion.button>
    );
}
