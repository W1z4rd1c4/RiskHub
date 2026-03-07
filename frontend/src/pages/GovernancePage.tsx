import { useState } from 'react';
import { motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import {
    Scale,
    ClipboardList,
    AlertTriangle,
    RefreshCw,
    TrendingUp,
    Building2
} from 'lucide-react';
import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import type { OrphanedItem } from '@/types/orphanedItem';
import { OrphanedItemsTable, ResolveOrphanModal, OrphanQuickViewModal } from '@/components/governance';
import { GOVERNANCE_POLL_MS } from '@/config/constants';
import { useAuthz } from '@/authz/useAuthz';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

function GovernancePageInner() {
    const { t } = useTranslation('admin');
    const [selectedOrphan, setSelectedOrphan] = useState<OrphanedItem | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewingOrphan, setViewingOrphan] = useState<OrphanedItem | null>(null);
    const [activeTab, setActiveTab] = useState<'risk' | 'control' | 'kri'>('risk');

    const overviewQuery = useAdaptivePollingQuery({
        queryKey: ['governanceOverview'],
        queryFn: ({ signal }) => orphanedItemsApi.getOverview({ status: 'pending' }, { signal }),
        pollMs: GOVERNANCE_POLL_MS,
    });

    const stats = overviewQuery.data?.stats ?? null;
    const orphans = overviewQuery.data?.items ?? [];
    const lastScanAt = overviewQuery.data?.last_scan_at ?? null;
    const scanStatus = overviewQuery.data?.scan_status ?? null;

    const handleResolve = (orphan: OrphanedItem) => {
        setSelectedOrphan(orphan);
        setIsModalOpen(true);
    };

    const handleResolved = () => {
        void overviewQuery.refresh();
    };

    if (overviewQuery.isLoading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-8 w-8 text-accent animate-spin" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{t('governance.loading')}</p>
                </div>
            </div>
        );
    }

    const filteredOrphans = orphans.filter(o => o.item_type === activeTab);

    const statBars = [
        {
            id: 'risk' as const,
            title: t('governance.pending_orphans'),
            subtitle: t('governance.risks'),
            value: stats?.risk_count ?? 0,
            icon: Scale,
            color: 'text-amber-400',
            bg: 'bg-amber-400/10',
            trend: t('governance.action_required'),
            clickable: true,
        },
        {
            id: 'control' as const,
            title: t('governance.orphaned_controls'),
            subtitle: t('governance.controls'),
            value: stats?.control_count ?? 0,
            icon: ClipboardList,
            color: 'text-rose-400',
            bg: 'bg-rose-400/10',
            trend: t('governance.critical'),
            clickable: true,
        },
        {
            id: 'kri' as const,
            title: t('governance.orphaned_kris'),
            subtitle: t('governance.kris'),
            value: stats?.kri_count ?? 0,
            icon: AlertTriangle,
            color: 'text-accent',
            bg: 'bg-accent/10',
            trend: t('governance.needs_linkage'),
            clickable: true,
        },
        {
            id: 'total' as const,
            title: t('governance.uncategorised'),
            subtitle: t('governance.total'),
            value: stats?.total_count ?? 0,
            icon: Building2,
            color: 'text-slate-400',
            bg: 'bg-slate-400/10',
            trend: t('governance.grand_total'),
            clickable: false,
        },
    ];

    return (
        <div className="space-y-10">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('governance.title')}</h2>
                    <p className="text-slate-500 font-medium">{t('governance.subtitle')}</p>
                    {(lastScanAt || scanStatus) && (
                        <p className="text-xs text-slate-500 mt-2">
                            {scanStatus ? `${scanStatus}` : ''}
                            {lastScanAt ? ` • ${new Date(lastScanAt).toLocaleString()}` : ''}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { void overviewQuery.refresh(); }}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title={t('governance.refresh')}
                    >
                        <RefreshCw className="h-5 w-5" />
                    </button>
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t('governance.live_status')}
                    </div>
                </div>
            </div>

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
            >
                {statBars.map((bar) => {
                    const isActive = activeTab === bar.id;
                    return (
                        <motion.div
                            key={bar.id}
                            variants={item}
                            onClick={() => bar.clickable && setActiveTab(bar.id as 'risk' | 'control' | 'kri')}
                            className={`glass-card group flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${isActive
                                ? 'ring-2 ring-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]'
                                : 'hover:bg-white/5 grayscale-[0.5] opacity-70 hover:opacity-100 hover:grayscale-0'
                                } ${!bar.clickable && 'cursor-default grayscale-0 opacity-100'}`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeBar"
                                    className="absolute inset-0 bg-accent/5 pointer-events-none"
                                />
                            )}
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className={`${bar.bg} p-3 rounded-xl`}>
                                    <bar.icon className={`h-6 w-6 ${bar.color}`} />
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    {bar.trend}
                                </div>
                            </div>
                            <div className="relative z-10">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{bar.subtitle}</p>
                                <p className="text-sm font-bold text-white/70 mb-2">{bar.title}</p>
                                <h3 className="text-4xl font-black text-white tracking-tighter">{bar.value}</h3>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                key={activeTab} // Animate on tab swap
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        {activeTab === 'risk' ? t('governance.orphaned_risks_section') : activeTab === 'control' ? t('governance.orphaned_controls_section') : t('governance.orphaned_kris_section')}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
                <OrphanedItemsTable
                    items={filteredOrphans}
                    onResolve={handleResolve}
                    onView={setViewingOrphan}
                />
            </motion.div>

            <ResolveOrphanModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                orphan={selectedOrphan}
                onResolved={handleResolved}
            />

            <OrphanQuickViewModal
                isOpen={!!viewingOrphan}
                onClose={() => setViewingOrphan(null)}
                orphan={viewingOrphan}
            />
        </div>
    );
}

export default function GovernancePage() {
    const authz = useAuthz();

    // CRO-only business route. Keep a local guard so direct page mounts never hit orphan APIs for blocked roles.
    if (!authz.canViewGovernance) {
        return <Navigate to="/" replace />;
    }

    return <GovernancePageInner />;
}
