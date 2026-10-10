import { useId } from 'react';
import type { Risk } from '@/types/risk';
import { ArrowRight, Shield, Target, User, BarChart, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { useRiskThresholds, useRiskTypes } from '@/hooks/useRiskHubConfig';
import { classifyRiskScore, severityClass, type SeverityBand } from '@/lib/severity';
import { cn } from '@/lib/utils';
import { Badge, SeverityBadge } from './ui/badge';
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
                <span className={cn('text-2xl font-bold tabular-nums', severityClass('text', band))}>{score}</span>
                <SeverityBadge band={band} label={t(RISK_BAND_LABEL_KEYS[band])} className="uppercase tracking-wide" />
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
                {risk.category ? (
                    <Badge size="sm" shape="rounded" className="mt-2">
                        {risk.category}
                    </Badge>
                ) : null}
            </DialogHeader>

            {/* Body */}
            <DialogBody className="custom-scrollbar space-y-8">
                {/* Description */}
                <div>
                    <h3 className="text-eyebrow mb-3">{t('common:labels.description')}</h3>
                    <p className="text-sm text-foreground leading-relaxed font-medium">
                        {risk.description}
                    </p>
                </div>

                {/* Matrix */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-tint/5 rounded-xl p-4 border border-border">
                        <h3 className="text-eyebrow mb-3 flex items-center gap-2">
                            <BarChart aria-hidden="true" className="h-3 w-3" /> {t('risks:fields.gross_score')}
                        </h3>
                        <div className="flex items-baseline gap-2">
                            {renderScore(risk.gross_score)}
                            <span className="text-xs text-muted-foreground font-bold">
                                {t('risks:scoring.factors_short', { probability: risk.gross_probability, impact: risk.gross_impact })}
                            </span>
                        </div>
                    </div>
                    <div className="bg-tint/5 rounded-xl p-4 border border-border">
                        <h3 className="text-eyebrow mb-3 flex items-center gap-2">
                            <BarChart aria-hidden="true" className="h-3 w-3" /> {t('risks:fields.net_score')}
                        </h3>
                        <div className="flex items-baseline gap-2">
                            {renderScore(risk.net_score)}
                            <span className="text-xs text-muted-foreground font-bold">
                                {t('risks:scoring.factors_short', { probability: risk.net_probability, impact: risk.net_impact })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                    <div>
                        <h3 className="text-eyebrow mb-2 flex items-center gap-2">
                            <User aria-hidden="true" className="h-3 w-3" /> {t('risks:fields.owner')}
                        </h3>
                        <p className="text-sm font-bold text-foreground">{risk.owner?.name || t('common:labels.unknown')}</p>
                        <p className="text-xs text-muted-foreground">{risk.owner?.email}</p>
                    </div>
                    <div>
                        <h3 className="text-eyebrow mb-2 flex items-center gap-2">
                            <Target aria-hidden="true" className="h-3 w-3" /> {t('risks:fields.department')}
                        </h3>
                        <p className="text-sm font-bold text-foreground">{risk.department?.name || t('common:labels.unknown')}</p>
                    </div>
                    <div>
                        <h3 className="text-eyebrow mb-2 flex items-center gap-2">
                            <Shield aria-hidden="true" className="h-3 w-3" /> {t('risks:fields.type')}
                        </h3>
                        <p className="text-sm font-bold text-foreground">{getRiskTypeName(risk.risk_type)}</p>
                    </div>
                    <div>
                        <h3 className="text-eyebrow mb-2 flex items-center gap-2">
                            <Calendar aria-hidden="true" className="h-3 w-3" /> {t('common:labels.updated_at')}
                        </h3>
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
