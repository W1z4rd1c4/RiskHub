import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import {
    Shield,
    ChevronRight,
    Loader2,
    LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';
import { useAuthz } from '@/authz/useAuthz';
import { dashboardKeys } from '@/lib/queryKeys';
import { getSidebarNavRoutes } from '@/routing';
import { userApi } from '@/services/userApi';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SIDEBAR_POLL_MS } from '@/config/constants';
import './sidebar.css';

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout, logoutPending, logoutErrorKey, hasPermission } = useAuth();
    const authz = useAuthz();
    const isAdmin = authz.isPlatformAdmin;
    const { t } = useTranslation('navigation');
    const { t: tCommon } = useTranslation('common');
    const { t: tErrors } = useTranslation('errorKeys');

    // Badge polling gates:
    // - Admin console should not poll business data.
    const shouldPollShellSummary = !!user?.id && !isAdmin;

    const shellSummaryQuery = useAdaptivePollingQuery({
        queryKey: dashboardKeys.shellSummary(user?.id, user?.department_id ?? null, user?.access_scope ?? null),
        queryFn: ({ signal }) => userApi.getShellSummary({ signal }),
        pollMs: SIDEBAR_POLL_MS,
        enabled: shouldPollShellSummary,
    });

    const workflowCount = (shellSummaryQuery.data?.pending_approvals_count ?? 0)
        + (shellSummaryQuery.data?.questionnaire_inbox_count ?? 0);
    const orphanCount = authz.canViewGovernance ? (shellSummaryQuery.data?.orphan_total_count ?? 0) : 0;
    const unreadNotificationCount = shellSummaryQuery.data?.unread_notifications_count ?? 0;
    const [notificationCountOverride, setNotificationCountOverride] = useState<number | null>(null);
    const notificationRefreshTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (notificationCountOverride !== null && unreadNotificationCount === notificationCountOverride) {
            setNotificationCountOverride(null);
        }
    }, [notificationCountOverride, unreadNotificationCount]);

    const displayedUnreadNotificationCount = notificationCountOverride ?? unreadNotificationCount;

    const handleUnreadCountChange = (count: number) => {
        setNotificationCountOverride(count);
        if (notificationRefreshTimeoutRef.current !== null) {
            window.clearTimeout(notificationRefreshTimeoutRef.current);
        }
        notificationRefreshTimeoutRef.current = window.setTimeout(() => {
            notificationRefreshTimeoutRef.current = null;
            void shellSummaryQuery.refresh();
        }, 150);
    };

    useEffect(() => {
        return () => {
            if (notificationRefreshTimeoutRef.current !== null) {
                window.clearTimeout(notificationRefreshTimeoutRef.current);
            }
        };
    }, []);

    const handleLogout = async () => {
        try {
            await logout();
            await navigate('/login');
        } catch {
            // Keep the user on the current screen so they can retry.
        }
    };
    const navigation = getSidebarNavRoutes({ authz, hasPermission }).map((route) => {
        let badge: number | undefined;
        if (route.nav.badgeKey === 'workflow') {
            badge = workflowCount > 0 ? workflowCount : undefined;
        } else if (route.nav.badgeKey === 'orphanCount') {
            badge = orphanCount > 0 ? orphanCount : undefined;
        }

        return {
            href: route.nav.href,
            icon: route.nav.icon,
            label: t(`sidebar.${route.nav.labelKey}`),
            badge,
        };
    });

    const brandName = tCommon('brand.name');
    const brandAccentSuffix = 'Hub';
    const hasAccentSuffix = brandName.endsWith(brandAccentSuffix);
    const brandPrefix = hasAccentSuffix ? brandName.slice(0, -brandAccentSuffix.length) : brandName;

    return (
        <aside className="fixed inset-y-0 left-0 z-50 hidden lg:flex w-72 flex-col p-6">
            <div className="glass-card h-full flex flex-col p-4">
                <div className="flex items-center justify-between px-2 mb-10">
                    <div className="flex items-center gap-3">
                        <div className="bg-accent p-2 rounded-xl">
                            <Shield className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white font-heading">
                            {hasAccentSuffix ? (
                                <>
                                    {brandPrefix}
                                    <span className="text-accent">{brandAccentSuffix}</span>
                                </>
                            ) : (
                                brandName
                            )}
                        </span>
                    </div>
                    <NotificationBell
                        unreadCount={displayedUnreadNotificationCount}
                        onUnreadCountChange={handleUnreadCountChange}
                    />
                </div>

                <nav className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    'group flex items-center justify-between px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                                    isActive
                                        ? 'sidebar-nav-link--active'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                )}
                            >
                                <div className="sidebar-nav-content flex items-center gap-3">
                                    <item.icon className={cn('sidebar-nav-icon h-5 w-5', isActive ? '' : 'text-slate-500 group-hover:text-white')} />
                                    {item.label}
                                </div>
                                {item.badge !== undefined && (
                                    <span className="sidebar-nav-badge text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {item.badge}
                                    </span>
                                )}
                                {isActive && item.badge === undefined && <ChevronRight className="sidebar-nav-chevron h-4 w-4" />}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto pt-6 border-t border-white/10 space-y-4">
                    {user && (
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                                <span className="text-xs font-bold text-accent">{user.name.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                                <p className="text-xs text-slate-300 truncate">{user.role_display_name}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        data-testid="logout-button"
                        disabled={logoutPending}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {logoutPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                        {t('user_menu.logout')}
                    </button>
                    {logoutErrorKey && (
                        <p className="px-3 text-xs text-rose-300">{tErrors(logoutErrorKey)}</p>
                    )}
                </div>
            </div>
        </aside>
    );
}
