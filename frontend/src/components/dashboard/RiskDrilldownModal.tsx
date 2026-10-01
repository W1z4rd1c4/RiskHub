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
import { classifyRiskScore, legacyRiskScoreVariantClass } from '@/lib/riskScoreTheme';
import { logError } from '@/services/logger';

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
        return legacyRiskScoreVariantClass('text', score, thresholds);
    };

    const getSeverityLabel = () => {
        return t(`issues.severity.${classifyRiskScore(score, thresholds)}`);
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
                    loadingFallback={(
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                    errorFallback={(
                        <div className="text-center py-8 text-destructive">
                            {error}
                        </div>
                    )}
                    emptyFallback={(
                        <div className="text-center py-8 text-muted-foreground">
                            {t('risk_drilldown.no_risks_at_position')}
                        </div>
                    )}
                >
                    <div className="space-y-2">
                        {risks.map((risk) => (
                            <motion.button
                                key={risk.id}
                                onClick={() => handleRiskClick(risk.id)}
                                className="w-full text-left p-4 rounded-lg bg-tint/5 hover:bg-tint/10 border border-border hover:border-border transition-colors group"
                                whileHover={{ x: 4 }}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-foreground group-hover:text-accent-text transition-colors">
                                            {risk.name}
                                        </h4>
                                        {risk.description && (
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                {risk.description}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-2">
                                            {risk.department_name}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-sm font-bold ${legacyRiskScoreVariantClass('text', risk.net_score, thresholds)}`}
                                            >
                                                {t('risk_drilldown.score_value', { score: risk.net_score })}
                                            </span>
                                            <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {risk.owner_name || t('issues:fallbacks.unassigned')}
                                        </p>
                                    </div>
                                </div>
                            </motion.button>
                        ))}
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
