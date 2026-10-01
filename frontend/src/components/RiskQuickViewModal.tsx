import { useId } from 'react';
import type { Risk } from '@/types/risk';
import { ArrowRight, Shield, Target, User, BarChart, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { useRiskThresholds, useRiskTypes } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, severityClass, type SeverityBand } from '@/lib/severity';
import { cn } from '@/lib/utils';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from './ui/dialog';

const RISK_BAND_LABEL_KEYS: Record<SeverityBand, string> = {
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
    const { t } = useTranslation(['risks', 'common']);
    const format = useFormat();
    const titleId = useId();
    const { thresholds } = useRiskThresholds();
    const { getDisplayName: getRiskTypeName } = useRiskTypes();

    if (!risk) return null;

    const renderScore = (score: number) => {
        const band = classifyRiskScore(score, thresholds);
        return (
            <>
                <span className={cn('text-2xl font-black', severityClass('text', band))}>{score}</span>
                <span
                    className={cn(
                        'px-2 py-0.5 rounded border text-xs font-bold uppercase tracking-wide',
                        severityClass('badge', band),
                    )}
                >
                    {t(RISK_BAND_LABEL_KEYS[band])}
                </span>
            </>
        );
    };

    return (
        <DialogShell isOpen={isOpen} onClose={onClose} titleId={titleId} size="lg">
            <DialogHeader
                title={risk.name || risk.process}
                description={risk.process || undefined}
                icon={Shield}
            >
                <span className="mt-2 inline-flex rounded border border-border bg-tint/10 px-2 py-0.5 text-eyebrow">
                    {risk.category}
                </span>
            </DialogHeader>

            {/* Body */}
            <DialogBody className="custom-scrollbar space-y-8">
                {/* Description */}
                <div>
                    <h4 className="text-eyebrow mb-3">{t('common:labels.description')}</h4>
                    <p className="text-sm text-foreground leading-relaxed font-medium">
                        {risk.description}
                    </p>
                </div>

                {/* Matrix */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-tint/5 rounded-xl p-4 border border-border">
                        <h4 className="text-eyebrow mb-3 flex items-center gap-2">
                            <BarChart className="h-3 w-3" /> {t('risks:fields.gross_score')}
                        </h4>
                        <div className="flex items-baseline gap-2">
                            {renderScore(risk.gross_score)}
                            <span className="text-xs text-muted-foreground font-bold">
                                (P: {risk.gross_probability} × I: {risk.gross_impact})
                            </span>
                        </div>
                    </div>
                    <div className="bg-tint/5 rounded-xl p-4 border border-border">
                        <h4 className="text-eyebrow mb-3 flex items-center gap-2">
                            <BarChart className="h-3 w-3" /> {t('risks:fields.net_score')}
                        </h4>
                        <div className="flex items-baseline gap-2">
                            {renderScore(risk.net_score)}
                            <span className="text-xs text-muted-foreground font-bold">
                                (P: {risk.net_probability} × I: {risk.net_impact})
                            </span>
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                    <div>
                        <h4 className="text-eyebrow mb-2 flex items-center gap-2">
                            <User className="h-3 w-3" /> {t('risks:fields.owner')}
                        </h4>
                        <p className="text-sm font-bold text-foreground">{risk.owner?.name || t('common:labels.unknown')}</p>
                        <p className="text-xs text-muted-foreground">{risk.owner?.email}</p>
                    </div>
                    <div>
                        <h4 className="text-eyebrow mb-2 flex items-center gap-2">
                            <Target className="h-3 w-3" /> {t('risks:fields.department')}
                        </h4>
                        <p className="text-sm font-bold text-foreground">{risk.department?.name || t('common:labels.unknown')}</p>
                    </div>
                    <div>
                        <h4 className="text-eyebrow mb-2 flex items-center gap-2">
                            <Shield className="h-3 w-3" /> {t('risks:fields.type')}
                        </h4>
                        <p className="text-sm font-bold text-foreground">{getRiskTypeName(risk.risk_type)}</p>
                    </div>
                    <div>
                        <h4 className="text-eyebrow mb-2 flex items-center gap-2">
                            <Calendar className="h-3 w-3" /> {t('common:labels.updated_at')}
                        </h4>
                        <p className="text-sm font-bold text-foreground">
                            {format.date(risk.updated_at)}
                        </p>
                    </div>
                </div>
            </DialogBody>

            <DialogFooter
                hideCancel
                submitLabel={(
                    <>
                        {t('risks:view_risk')}
                        <ArrowRight aria-hidden="true" />
                    </>
                )}
                onSubmit={() => navigate(`/risks/${risk.id}`)}
            />
        </DialogShell>
    );
}
