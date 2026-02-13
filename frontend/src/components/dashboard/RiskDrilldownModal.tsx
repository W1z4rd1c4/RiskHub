import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../services/dashboardApi';
import { useTranslation } from '@/i18n/hooks';

import { useDashboardFilters } from '../../contexts/DashboardFilterContext';

interface RiskInCell {
    id: number;
    risk_id_code?: string;
    name: string;
    description?: string;
    net_score: number;
    department_name: string;
    owner_name?: string;
}

interface RiskDrilldownModalProps {
    isOpen: boolean;
    onClose: () => void;
    probability: number;
    impact: number;
    riskType?: 'gross' | 'net';
}

export function RiskDrilldownModal({ isOpen, onClose, probability, impact, riskType = 'net' }: RiskDrilldownModalProps) {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const { filters } = useDashboardFilters();
    const [risks, setRisks] = useState<RiskInCell[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchRisks = useCallback(async () => {
        if (!isOpen) return;

        setIsLoading(true);
        setError(null);

        try {
            const data = await dashboardApi.fetchRisksByCell(probability, impact, filters, riskType);
            setRisks(data);
        } catch (err) {
            console.error('Error fetching risks:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [filters, impact, isOpen, probability, riskType, t]);

    useEffect(() => {
        fetchRisks();
    }, [fetchRisks]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    const score = probability * impact;
    const getSeverityColor = () => {
        if (score >= 16) return 'text-rose-400';
        if (score >= 10) return 'text-orange-400';
        if (score >= 5) return 'text-amber-400';
        return 'text-emerald-400';
    };

    const getSeverityLabel = () => {
        if (score >= 16) return t('issues.severity.critical');
        if (score >= 10) return t('issues.severity.high');
        if (score >= 5) return t('issues.severity.medium');
        return t('issues.severity.low');
    };

    const handleRiskClick = (riskId: number) => {
        navigate(`/risks/${riskId}`);
        onClose();
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg z-10"
                    >
                        <div className="glass-card !p-0 overflow-hidden shadow-2xl">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${score >= 16 ? 'bg-rose-500/20' : score >= 10 ? 'bg-orange-500/20' : score >= 5 ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
                                        <AlertTriangle className={`h-5 w-5 ${getSeverityColor()}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">
                                            {t('risk_drilldown.title', {
                                                riskType: riskType === 'gross' ? t('risk_drilldown.gross') : t('risk_drilldown.net'),
                                                probability,
                                                impact,
                                            })}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            Score: {score} • <span className={getSeverityColor()}>{getSeverityLabel()}</span>
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {isLoading && (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}

                                {error && (
                                    <div className="text-center py-8 text-rose-400">
                                        {error}
                                    </div>
                                )}

                                {!isLoading && !error && risks.length === 0 && (
                                    <div className="text-center py-8 text-slate-500">
                                        {t('risk_drilldown.no_risks_at_position')}
                                    </div>
                                )}

                                {!isLoading && !error && risks.length > 0 && (
                                    <div className="space-y-2">
                                        {risks.map((risk) => (
                                            <motion.button
                                                key={risk.id}
                                                onClick={() => handleRiskClick(risk.id)}
                                                className="w-full text-left p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all group"
                                                whileHover={{ x: 4 }}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-white group-hover:text-accent transition-colors">
                                                            {risk.name}
                                                        </h4>
                                                        {risk.description && (
                                                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                                                                {risk.description}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-slate-500 mt-2">
                                                            {risk.department_name}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-sm font-bold ${risk.net_score >= 15 ? 'text-rose-400' :
                                                                risk.net_score >= 10 ? 'text-orange-400' :
                                                                    risk.net_score >= 5 ? 'text-amber-400' :
                                                                        'text-emerald-400'
                                                                }`}>
                                                                Score: {risk.net_score}
                                                            </span>
                                                            <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-white transition-colors" />
                                                        </div>
                                                        <p className="text-xs text-slate-500">
                                                            {risk.owner_name || t('issues:fallbacks.unassigned')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02]">
                                <p className="text-xs text-slate-500 text-center">
                                    {t('risk_drilldown.footer_prefix')} <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white font-mono">Esc</kbd> {t('risk_drilldown.footer_suffix')}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
