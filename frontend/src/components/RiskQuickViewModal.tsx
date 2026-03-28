import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Risk } from '@/types/risk';
import { Shield, Target, User, BarChart, Calendar, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';

interface RiskQuickViewModalProps {
    risk: Risk | null;
    isOpen: boolean;
    onClose: () => void;
}

export function RiskQuickViewModal({ risk, isOpen, onClose }: RiskQuickViewModalProps) {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['risks', 'common']);

    if (typeof document === 'undefined') return null;
    if (!risk) return null;

    const getRiskLevelColor = (level: number) => {
        if (level >= 20) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        if (level >= 12) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
        if (level >= 6) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl glass-card !p-0 overflow-hidden flex flex-col shadow-2xl"
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
                                    <h2 className="text-xl font-black text-white leading-tight mb-2 tracking-tight">
                                        {risk.name || risk.process}
                                    </h2>
                                    {risk.process && <p className="text-sm text-slate-500 font-bold">{risk.process}</p>}
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="h-5 w-5" />
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
                                        <span className={`text-2xl font-black ${getRiskLevelColor(risk.gross_score).split(' ')[0]}`}>
                                            {risk.gross_score}
                                        </span>
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
                                        <span className={`text-2xl font-black ${getRiskLevelColor(risk.net_score).split(' ')[0]}`}>
                                            {risk.net_score}
                                        </span>
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
                                    <p className="text-sm font-bold text-white capitalize">{risk.risk_type}</p>
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
                                onClick={() => navigate(`/risks/${risk.id}`)}
                                className="px-6 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
                            >
                                {t('risks:view_risk')} <div className="text-[10px] opacity-60">→</div>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
