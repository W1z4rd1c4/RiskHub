import { useId } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, ShieldAlert, TrendingUp } from 'lucide-react';

import { ControlTrendChart } from '@/components/dashboard/ControlTrendChart';
import { DepartmentTable } from '@/components/dashboard/DepartmentTable';
import { KRIBreachHistoryChart } from '@/components/dashboard/KRIBreachHistoryChart';
import { KRIBreachWidget } from '@/components/dashboard/KRIBreachWidget';
import { KRIStatusWidget } from '@/components/dashboard/KRIStatusWidget';
import { RiskDistributionMatrix } from '@/components/dashboard/RiskDistributionMatrix';
import { RiskDrilldownModal } from '@/components/dashboard/RiskDrilldownModal';
import { RiskTrendChart } from '@/components/dashboard/RiskTrendChart';
import { Card, CardHeader } from '@/components/ui/card';
import type {
    ControlTrend,
    DashboardOverview,
    DepartmentMetrics,
} from '@/types/dashboard';

interface DashboardRiskSectionsProps {
    breachHistoryTitle: string;
    breachTrends: DashboardOverview['kri_breach_trends'];
    canUseDepartmentFilter: boolean;
    controlExecutionTitle: string;
    departmentMetrics: DepartmentMetrics[];
    departmentVisibilityTitle: string;
    grossDistribution: DashboardOverview['gross_distribution'] | null;
    grossMatrixTitle: string;
    historicalTitle: string;
    netDistribution: DashboardOverview['net_distribution'] | null;
    netMatrixTitle: string;
    noExecutionHistoryLabel: string;
    onGrossCellClick: (probability: number, impact: number) => void;
    onNetCellClick: (probability: number, impact: number) => void;
    onRiskModalClose: () => void;
    riskCreationTitle: string;
    riskModal: {
        impact: number;
        isOpen: boolean;
        probability: number;
        riskType: 'gross' | 'net';
    };
    riskTrends: DashboardOverview['risk_trends'];
    trends: ControlTrend[];
}

export function DashboardRiskSections({
    breachHistoryTitle,
    breachTrends,
    canUseDepartmentFilter,
    controlExecutionTitle,
    departmentMetrics,
    departmentVisibilityTitle,
    grossDistribution,
    grossMatrixTitle,
    historicalTitle,
    netDistribution,
    netMatrixTitle,
    noExecutionHistoryLabel,
    onGrossCellClick,
    onNetCellClick,
    onRiskModalClose,
    riskCreationTitle,
    riskModal,
    riskTrends,
    trends,
}: DashboardRiskSectionsProps) {
    const historicalTitleId = useId();
    return (
        <>
            <div className="grid gap-8 lg:grid-cols-3">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="lg:col-span-2"
                >
                    <Card as="section" className="flex h-full flex-col">
                        <CardHeader title={controlExecutionTitle} icon={TrendingUp} className="mb-8" />
                        <div className="flex min-h-[300px] flex-1 flex-col justify-center">
                            <ControlTrendChart data={trends} emptyMessage={noExecutionHistoryLabel} />
                        </div>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.65 }}
                    className="h-full"
                >
                    <KRIBreachWidget />
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 }}
                    className="h-full"
                >
                    <KRIStatusWidget />
                </motion.div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                >
                    <Card as="section" className="flex h-full flex-col">
                        <CardHeader title={grossMatrixTitle} icon={ShieldAlert} className="mb-8" />
                        <div className="flex flex-1 items-center justify-center pb-4">
                            <RiskDistributionMatrix
                                distribution={grossDistribution?.distribution ?? []}
                                onCellClick={onGrossCellClick}
                            />
                        </div>
                    </Card>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.75 }}
                >
                    <Card as="section" className="flex h-full flex-col">
                        <CardHeader title={netMatrixTitle} icon={ShieldAlert} className="mb-8" />
                        <div className="flex flex-1 items-center justify-center pb-4">
                            <RiskDistributionMatrix
                                distribution={netDistribution?.distribution ?? []}
                                onCellClick={onNetCellClick}
                            />
                        </div>
                    </Card>
                </motion.div>
            </div>

            <section className="space-y-6" aria-labelledby={historicalTitleId}>
                <div className="flex items-center gap-3 px-2">
                    <div aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                    <h2 id={historicalTitleId} className="text-eyebrow whitespace-nowrap">
                        {historicalTitle}
                    </h2>
                    <div aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.75 }}
                    >
                        <Card className="h-full overflow-hidden">
                            <CardHeader title={riskCreationTitle} titleAs="h3" icon={TrendingUp} className="mb-8" />
                            <RiskTrendChart data={riskTrends} />
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                    >
                        <Card className="h-full overflow-hidden">
                            <CardHeader title={breachHistoryTitle} titleAs="h3" icon={AlertTriangle} className="mb-8" />
                            <KRIBreachHistoryChart data={breachTrends} />
                        </Card>
                    </motion.div>
                </div>
            </section>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 }}
            >
                <Card as="section" padding="none" className="overflow-hidden">
                    <CardHeader
                        title={departmentVisibilityTitle}
                        icon={Building2}
                        className="mb-0 border-b border-border p-6"
                    />
                    <DepartmentTable
                        canUseDepartmentFilter={canUseDepartmentFilter}
                        metrics={departmentMetrics.filter(
                            (metric) => metric.risk_count > 0 || metric.control_count > 0,
                        )}
                    />
                </Card>
            </motion.div>

            <RiskDrilldownModal
                isOpen={riskModal.isOpen}
                onClose={onRiskModalClose}
                probability={riskModal.probability}
                impact={riskModal.impact}
                riskType={riskModal.riskType}
            />
        </>
    );
}
