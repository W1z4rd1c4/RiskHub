import { useState, useEffect, useCallback, useId } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../services/dashboardApi';
import { useTranslation } from '@/i18n/hooks';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';

import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { useDashboardFilterSelector } from '../../contexts/DashboardFilterContext';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, riskScoreVariantClass } from '@/lib/severity';
import { logError } from '@/services/logger';
import { SeverityBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/state';

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
    const titleId = useId();
    const descriptionId = useId();
    const navigate = useNavigate();
    const filters = useDashboardFilterSelector(state => state.filters);
    const { thresholds } = useRiskThresholds();
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
            logError('Error fetching risks:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [filters, impact, isOpen, probability, riskType, t]);

    useEffect(() => {
        void fetchRisks();
    }, [fetchRisks]);

    const score = probability * impact;
    const getSeverityColor = () => {
        return riskScoreVariantClass('text', score, thresholds);
    };

    const getSeverityLabel = () => {
        return t(`risk_levels.${classifyRiskScore(score, thresholds)}`);
    };

    const handleRiskClick = (riskId: number) => {
        void navigate(`/risks/${riskId}`);
        onClose();
    };
    const contentTitle = t('risk_drilldown.results');

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            size="md"
            className="max-w-lg"
        >
            <DialogHeader
                title={t('risk_drilldown.title', {
                    riskType: riskType === 'gross' ? t('risk_drilldown.gross') : t('risk_drilldown.net'),
                    probability,
                    impact,
                })}
                descriptionId={descriptionId}
                description={(
                    <>
                        {t('risk_drilldown.score_value', { score })} • <span className={getSeverityColor()}>{getSeverityLabel()}</span>
                    </>
                )}
            />

            {/* Content */}
            <DialogBody className="max-h-[400px] custom-scrollbar">
                <WidgetShell
                    title={contentTitle}
                    isLoading={isLoading}
                    error={error ? new Error(error) : null}
                    isEmpty={risks.length === 0}
                    emptyLabel={t('risk_drilldown.no_risks_at_position')}
                    errorFallback={(
                        <ErrorState message={error} onRetry={() => { void fetchRisks(); }} />
                    )}
                >
                    <div className="space-y-2">
                        {risks.map((risk) => {
                            const band = classifyRiskScore(risk.net_score, thresholds);
                            return (
                                <motion.button
                                    key={risk.id}
                                    type="button"
                                    onClick={() => handleRiskClick(risk.id)}
                                    className="w-full text-left p-4 rounded-lg bg-tint/5 hover:bg-tint/10 border border-border transition-colors group focus-ring"
                                    whileHover={{ x: 4 }}
                                >
                                    <span className="flex items-start justify-between gap-4">
                                        <span className="block flex-1 min-w-0">
                                            <span className="block font-bold text-foreground group-hover:text-accent-text transition-colors">
                                                {risk.name}
                                            </span>
                                            {risk.description && (
                                                <span className="block text-sm text-muted-foreground mt-1 line-clamp-2">
                                                    {risk.description}
                                                </span>
                                            )}
                                            <span className="block text-xs text-muted-foreground mt-2">
                                                {risk.department_name}
                                            </span>
                                        </span>
                                        <span className="flex flex-col items-end gap-1 shrink-0">
                                            <span className="flex items-center gap-2">
                                                {/* D1: the band label travels with the band colour. */}
                                                <SeverityBadge band={band} label={t(`risk_levels.${band}`)} size="sm" />
                                                <span
                                                    className={`text-sm font-bold ${riskScoreVariantClass('text', risk.net_score, thresholds)}`}
                                                >
                                                    {t('risk_drilldown.score_value', { score: risk.net_score })}
                                                </span>
                                                <ExternalLink aria-hidden="true" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {risk.owner_name || t('issues:fallbacks.unassigned')}
                                            </span>
                                        </span>
                                    </span>
                                </motion.button>
                            );
                        })}
                    </div>
                </WidgetShell>
            </DialogBody>

            {/* Footer */}
            <DialogFooter className="justify-center">
                <p className="text-xs text-muted-foreground text-center">
                    {t('risk_drilldown.footer_prefix')} <kbd className="px-1.5 py-0.5 bg-tint/10 rounded text-foreground font-mono">Esc</kbd> {t('risk_drilldown.footer_suffix')}
                </p>
            </DialogFooter>
        </DialogShell>
    );
}
