import { useId } from 'react';
import type { Risk } from '@/types/risk';
import { Shield, Target, User, BarChart, Calendar, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';
import { useRiskThresholds, useRiskTypes } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, riskScoreClass, type RiskScoreBand } from '@/lib/riskScoreTheme';
import { cn } from '@/lib/utils';
import { DialogShell } from './DialogShell';

const RISK_BAND_LABEL_KEYS: Record<RiskScoreBand, string> = {
    critical: 'risks:register.net_bands.critical',
    high: 'risks:register.net_bands.high',
    medium: 'risks:register.net_bands.medium',
    low: 'risks:register.net_bands.low',
};

interface RiskQuickViewModalProps {
    risk: Risk | null;
    isOpen: boolean;
    onClose: () => void;
}

export function RiskQuickViewModal({ risk, isOpen, onClose }: RiskQuickViewModalProps) {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['risks', 'common']);
    const titleId = useId();
    const { thresholds } = useRiskThresholds();
    const { getDisplayName: getRiskTypeName } = useRiskTypes();

    if (!risk) return null;

    const renderScore = (score: number) => {
        const band = classifyRiskScore(score, thresholds);
        return (
            <>
                <span className={cn('text-2xl font-black', riskScoreClass('text', band))}>{score}</span>
                <span
                    className={cn(
                        'px-2 py-0.5 rounded border text-xs font-bold uppercase tracking-wide',
                        riskScoreClass('badge', band),
                    )}
                >
                    {t(RISK_BAND_LABEL_KEYS[band])}
                </span>
            </>
        );
    };

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            backdropClassName="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            contentClassName="w-full max-w-2xl glass-card !p-0 overflow-hidden flex flex-col shadow-2xl"
        >
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-white/5 flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-accent/10 rounded-xl border border-accent/20 mt-1">
                        <Shield className="h-6 w-6 text-accent" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-white/10 border border-white/10 text-slate-400">
                                {risk.category}
                            </span>
                        </div>
                        <h2 id={titleId} className="text-xl font-black text-white leading-tight mb-2 tracking-tight">
                            {risk.name || risk.process}
                        </h2>
                        {risk.process && <p className="text-sm text-slate-500 font-bold">{risk.process}</p>}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common:actions.close')}
                    className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Description */}
                <div>
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('common:labels.description')}</h4>
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">
                        {risk.description}
                    </p>
                </div>

                {/* Matrix */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <BarChart className="h-3 w-3" /> {t('risks:fields.gross_score')}
                        </h4>
                        <div className="flex items-baseline gap-2">
                            {renderScore(risk.gross_score)}
                            <span className="text-xs text-slate-500 font-bold">
                                (P: {risk.gross_probability} × I: {risk.gross_impact})
                            </span>
                        </div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <BarChart className="h-3 w-3" /> {t('risks:fields.net_score')}
                        </h4>
                        <div className="flex items-baseline gap-2">
                            {renderScore(risk.net_score)}
                            <span className="text-xs text-slate-500 font-bold">
                                (P: {risk.net_probability} × I: {risk.net_impact})
                            </span>
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                    <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <User className="h-3 w-3" /> {t('risks:fields.owner')}
                        </h4>
                        <p className="text-sm font-bold text-white">{risk.owner?.name || t('common:labels.unknown')}</p>
                        <p className="text-xs text-slate-500">{risk.owner?.email}</p>
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Target className="h-3 w-3" /> {t('risks:fields.department')}
                        </h4>
                        <p className="text-sm font-bold text-white">{risk.department?.name || t('common:labels.unknown')}</p>
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Shield className="h-3 w-3" /> {t('risks:fields.type')}
                        </h4>
                        <p className="text-sm font-bold text-white">{getRiskTypeName(risk.risk_type)}</p>
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Calendar className="h-3 w-3" /> {t('common:labels.updated_at')}
                        </h4>
                        <p className="text-sm font-bold text-white">
                            {formatDateValue(risk.updated_at, i18n.language)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end">
                <button
                    type="button"
                    onClick={() => navigate(`/risks/${risk.id}`)}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
                >
                    {t('risks:view_risk')} <div className="text-[10px] opacity-60">→</div>
                </button>
            </div>
        </DialogShell>
    );
}
