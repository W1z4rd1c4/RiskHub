import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { TrendingUp } from 'lucide-react';
import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import type { OrphanedItem } from '@/types/orphanedItem';
import type { ApprovalCreatedResponse } from '@/types/approval';
import { OrphanedItemsTable, ResolveOrphanModal, OrphanQuickViewModal } from '@/components/governance';
import { GOVERNANCE_POLL_MS } from '@/config/constants';
import { governanceKeys } from '@/lib/queryKeys';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { ErrorState, LoadingState } from '@/components/ui/state';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ENTITY_ICONS } from '@/constants/entityIcons';
import { translateCode } from '@/lib/humanizeCode';
import { cn } from '@/lib/utils';

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

type GovernanceItemType = 'risk' | 'control' | 'kri' | 'threat' | 'process' | 'asset' | 'vendor';
const GOVERNANCE_ITEM_TYPES: readonly GovernanceItemType[] = [
    'risk',
    'control',
    'kri',
    'threat',
    'process',
    'asset',
    'vendor',
];

/** The orphan table's heading per type: the stat cards are the page's one type filter (SM-11). */
const SECTION_TITLE_KEYS: Readonly<Record<GovernanceItemType, string>> = {
    risk: 'governance.orphaned_risks_section',
    control: 'governance.orphaned_controls_section',
    kri: 'governance.orphaned_kris_section',
    threat: 'governance.orphaned_threats_section',
    process: 'governance.orphaned_processes_section',
    asset: 'governance.orphaned_assets_section',
    vendor: 'governance.orphaned_vendors_section',
};

function GovernancePageInner() {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const announceApprovalQueued = useApprovalQueued();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedOrphan, setSelectedOrphan] = useState<OrphanedItem | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewingOrphan, setViewingOrphan] = useState<OrphanedItem | null>(null);
    const requestedType = searchParams.get('type');
    const activeTab: GovernanceItemType = GOVERNANCE_ITEM_TYPES.find((type) => type === requestedType) ?? 'risk';

    const selectTab = (type: GovernanceItemType) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set('type', type);
            return next;
        });
    };

    const overviewQuery = useAdaptivePollingQuery({
        queryKey: governanceKeys.overview(),
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

    // D12 / PM-2: the user stays on Governance (the orphan row stays pending)
    // with the persistent pending notice deep-linking to the request in My
    // Requests, plus a success toast.
    const handleApprovalQueued = (response: ApprovalCreatedResponse) => {
        setIsModalOpen(false);
        announceApprovalQueued({ approvalId: response.approval_id });
        void overviewQuery.refresh();
    };

    // D7: the page title is the route's `h1` and `document.title` in every state.
    if (overviewQuery.isLoading && !stats) {
        return (
            <PageContainer>
                <PageHeader title={t('governance.title')} description={t('governance.subtitle')} />
                <LoadingState layout="page" label={t('governance.loading')} />
            </PageContainer>
        );
    }

    if (overviewQuery.isError && !stats) {
        return (
            <PageContainer>
                <PageHeader title={t('governance.title')} description={t('governance.subtitle')} />
                <ErrorState
                    layout="page"
                    title={t('governance.load_failed')}
                    message={t('governance.load_failed_help')}
                    onRetry={() => { void overviewQuery.refresh(); }}
                    retryLabel={t('governance.refresh')}
                    isRetrying={overviewQuery.isFetching}
                />
            </PageContainer>
        );
    }

    const filteredOrphans = orphans.filter(o => o.item_type === activeTab);
    // A poll that failed after data was loaded keeps the last list on screen, flagged as stale.
    const isStale = overviewQuery.isError && stats !== null;

    const statBars = [
        {
            id: 'risk' as const,
            title: t('governance.pending_orphans'),
            subtitle: t('governance.risks'),
            value: stats?.risk_count ?? 0,
            icon: ENTITY_ICONS.risk,
            color: 'text-warning-text',
            bg: 'bg-warning/10',
            trend: t('governance.action_required'),
            clickable: true,
        },
        {
            id: 'control' as const,
            title: t('governance.orphaned_controls'),
            subtitle: t('governance.controls'),
            value: stats?.control_count ?? 0,
            icon: ENTITY_ICONS.control,
            color: 'text-destructive',
            bg: 'bg-destructive/10',
            trend: t('governance.critical'),
            clickable: true,
        },
        {
            id: 'kri' as const,
            title: t('governance.orphaned_kris'),
            subtitle: t('governance.kris'),
            value: stats?.kri_count ?? 0,
            icon: ENTITY_ICONS.kri,
            color: 'text-accent-text',
            bg: 'bg-accent/10',
            trend: t('governance.needs_linkage'),
            clickable: true,
        },
        {
            id: 'threat' as const,
            title: t('governance.orphaned_threats'),
            subtitle: t('governance.threats'),
            value: stats?.threat_count ?? 0,
            icon: ENTITY_ICONS.threat,
            color: 'text-chart-3',
            bg: 'bg-chart-3/10',
            trend: t('governance.action_required'),
            clickable: true,
        },
        {
            id: 'process' as const,
            title: t('governance.orphaned_processes'),
            subtitle: t('governance.processes'),
            value: stats?.process_count ?? 0,
            icon: ENTITY_ICONS.process,
            color: 'text-accent-text',
            bg: 'bg-info/10',
            trend: t('governance.action_required'),
            clickable: true,
        },
        {
            id: 'asset' as const,
            title: t('governance.orphaned_assets'),
            subtitle: t('governance.assets'),
            value: stats?.asset_count ?? 0,
            icon: ENTITY_ICONS.asset,
            color: 'text-chart-2',
            bg: 'bg-chart-2/10',
            trend: t('governance.action_required'),
            clickable: true,
        },
        {
            id: 'vendor' as const,
            title: t('governance.orphaned_vendors'),
            subtitle: t('governance.vendors'),
            value: stats?.vendor_count ?? 0,
            icon: ENTITY_ICONS.vendor,
            color: 'text-severity-high-text',
            bg: 'bg-severity-high/10',
            trend: t('governance.action_required'),
            clickable: true,
        },
        {
            id: 'total' as const,
            title: t('governance.uncategorised'),
            subtitle: t('governance.total'),
            value: stats?.total_count ?? 0,
            icon: ENTITY_ICONS.department,
            color: 'text-muted-foreground',
            bg: 'bg-muted-foreground/10',
            trend: t('governance.grand_total'),
            clickable: false,
        },
    ];

    const statCardContents = (bar: typeof statBars[number], isActive: boolean): ReactNode => (
        <>
            {isActive && (
                <motion.div
                    layoutId="activeBar"
                    className="absolute inset-0 bg-accent/5 pointer-events-none"
                />
            )}
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className={cn(bar.bg, 'p-3 rounded-xl')}>
                    <bar.icon className={cn('h-6 w-6', bar.color)} aria-hidden="true" />
                </div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    {bar.trend}
                </div>
            </div>
            <div className="relative z-10">
                <p className="text-eyebrow mb-1">{bar.subtitle}</p>
                <p className="text-sm font-bold text-muted-foreground mb-2">{bar.title}</p>
                <p className="text-4xl font-bold text-foreground tracking-tight">{bar.value}</p>
            </div>
        </>
    );

    return (
        <PageContainer>
            <PageHeader
                title={t('governance.title')}
                description={(
                    <>
                        <p>{t('governance.subtitle')}</p>
                        {(lastScanAt || scanStatus) && (
                            <p className="text-xs text-muted-foreground mt-2">
                                {[
                                    scanStatus
                                        ? t('governance.scan_status_label', {
                                            status: translateCode(t, 'governance.scan_status', scanStatus),
                                        })
                                        : null,
                                    lastScanAt ? t('governance.last_scan_at', { date: format.dateTime(lastScanAt) }) : null,
                                ].filter(Boolean).join(' • ')}
                            </p>
                        )}
                    </>
                )}
                documentTitle={t('governance.title')}
                actions={(
                    <>
                        <RefreshButton
                            iconOnly
                            variant="outline"
                            label={t('governance.refresh')}
                            onRefresh={() => { void overviewQuery.refresh(); }}
                            isFetching={overviewQuery.isFetching}
                        />
                        {/* FB-02: the dot pulses only while a fetch is in flight and turns
                            danger when the last poll failed, instead of pulsing forever. */}
                        <Badge
                            tone={isStale ? 'danger' : 'success'}
                            dot
                            data-testid="governance-live-status"
                            className={cn(
                                'uppercase tracking-wide',
                                overviewQuery.isFetching && !isStale && '[&_[data-badge-dot]]:animate-pulse',
                            )}
                        >
                            {isStale ? t('governance.live_status_stale') : t('governance.live_status')}
                        </Badge>
                    </>
                )}
            />

            <ApprovalQueuedNotice />

            {isStale ? (
                <ErrorState
                    layout="section"
                    variant="banner"
                    message={t('governance.may_be_out_of_date')}
                    onRetry={() => { void overviewQuery.refresh(); }}
                    retryLabel={t('governance.refresh')}
                    isRetrying={overviewQuery.isFetching}
                />
            ) : null}

            <motion.div
                variants={container}
                initial={false}
                animate="show"
                // RS-01: auto-fit columns instead of a fixed six at `lg` (92px cards at 1024px).
                className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]"
            >
                {statBars.map((bar) => {
                    const isActive = activeTab === bar.id;
                    return bar.clickable ? (
                        // A pressed-card toggle: the whole card is one action (Card as="button", §4.10).
                        <Card
                            key={bar.id}
                            as="button"
                            interactive
                            onClick={() => selectTab(bar.id as GovernanceItemType)}
                            aria-pressed={isActive}
                            data-testid={`governance-filter-card-${bar.id}`}
                            className={cn(
                                'group relative flex flex-col justify-between overflow-hidden',
                                isActive && 'ring-2 ring-accent',
                            )}
                        >
                            {statCardContents(bar, isActive)}
                        </Card>
                    ) : (
                        <motion.div
                            key={bar.id}
                            variants={item}
                            data-testid={`governance-filter-card-${bar.id}`}
                            className="glass-card group flex flex-col justify-between relative overflow-hidden cursor-default"
                        >
                            {statCardContents(bar, false)}
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
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-tint/10 to-transparent" />
                    <h2 className="text-eyebrow">{t(SECTION_TITLE_KEYS[activeTab])}</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-tint/10 to-transparent" />
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
                onApprovalQueued={handleApprovalQueued}
                onResolved={handleResolved}
            />

            <OrphanQuickViewModal
                isOpen={!!viewingOrphan}
                onClose={() => setViewingOrphan(null)}
                orphan={viewingOrphan}
            />
        </PageContainer>
    );
}

/**
 * CRO-only business route. Access is owned by the route-level `GovernanceRouteGuard`
 * (`routing/business.tsx`); the page does not duplicate it (audit NAV-05). The backend
 * still authorises every orphan API call.
 */
export default function GovernancePage() {
    return <GovernancePageInner />;
}
