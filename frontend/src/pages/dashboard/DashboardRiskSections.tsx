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
    return (
        <>
            <div className="grid gap-8 lg:grid-cols-3">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass-card flex flex-col lg:col-span-2"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-accent" />
                            {controlExecutionTitle}
                        </h3>
                    </div>
                    <div className="flex-1 min-h-[300px]">
                        {trends.length > 0 ? (
                            <ControlTrendChart data={trends} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 border-t border-white/5">
                                <p className="text-sm font-medium">{noExecutionHistoryLabel}</p>
                            </div>
                        )}
                    </div>
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
                    className="glass-card flex flex-col"
                >
                    <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-orange-400" />
                        {grossMatrixTitle}
                    </h3>
                    <div className="flex-1 flex items-center justify-center pb-4">
                        <RiskDistributionMatrix
                            distribution={grossDistribution?.distribution ?? []}
                            onCellClick={onGrossCellClick}
                        />
                    </div>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.75 }}
                    className="glass-card flex flex-col"
                >
                    <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-purple-400" />
                        {netMatrixTitle}
                    </h3>
                    <div className="flex-1 flex items-center justify-center pb-4">
                        <RiskDistributionMatrix
                            distribution={netDistribution?.distribution ?? []}
                            onCellClick={onNetCellClick}
                        />
                    </div>
                </motion.div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">
                        {historicalTitle}
                    </h3>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.75 }}
                        className="glass-card group overflow-hidden"
                    >
                        <h3 className="text-xs font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest">
                            <TrendingUp className="h-4 w-4 text-accent" />
                            {riskCreationTitle}
                        </h3>
                        <RiskTrendChart data={riskTrends} />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="glass-card group overflow-hidden"
                    >
                        <h3 className="text-xs font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest">
                            <AlertTriangle className="h-4 w-4 text-orange-400" />
                            {breachHistoryTitle}
                        </h3>
                        <KRIBreachHistoryChart data={breachTrends} />
                    </motion.div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 }}
                className="glass-card !p-0 overflow-hidden"
            >
                <div className="p-6 border-b border-white/5 bg-white/[0.01]">
                    <h3 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-widest">
                        <Building2 className="h-4 w-4 text-emerald-400" />
                        {departmentVisibilityTitle}
                    </h3>
                </div>
                <DepartmentTable
                    canUseDepartmentFilter={canUseDepartmentFilter}
                    metrics={departmentMetrics.filter(
                        (metric) => metric.risk_count > 0 || metric.control_count > 0,
                    )}
                />
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
