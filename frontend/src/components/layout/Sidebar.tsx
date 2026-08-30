import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getGroupedSidebarNav, resolveActiveSidebarHref } from '@/routing';
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
        queryFn: () => userApi.getShellSummary(),
        pollMs: SIDEBAR_POLL_MS,
        enabled: shouldPollShellSummary,
    });
    const { refetch: refetchShellSummary } = shellSummaryQuery;

    const workflowCount = (shellSummaryQuery.data?.pending_approvals_count ?? 0)
        + (shellSummaryQuery.data?.questionnaire_inbox_count ?? 0);
    const orphanCount = authz.canViewGovernance ? (shellSummaryQuery.data?.orphan_total_count ?? 0) : 0;
    const unreadNotificationCount = shellSummaryQuery.data?.unread_notifications_count ?? 0;
    const [notificationCountOverride, setNotificationCountOverride] = useState<number | null>(null);
    const notificationRefreshTimeoutRef = useRef<number | null>(null);
    const navigationRef = useRef<HTMLElement>(null);
    const [hasMoreDestinationsBelow, setHasMoreDestinationsBelow] = useState(false);

    const measureNavigationOverflow = useCallback(() => {
        const navigation = navigationRef.current;
        if (!navigation) return;
        setHasMoreDestinationsBelow(
            navigation.scrollTop + navigation.clientHeight < navigation.scrollHeight - 1,
        );
    }, []);

    useEffect(() => {
        if (notificationCountOverride !== null && unreadNotificationCount === notificationCountOverride) {
            setNotificationCountOverride(null);
        }
    }, [notificationCountOverride, unreadNotificationCount]);

    const displayedUnreadNotificationCount = notificationCountOverride ?? unreadNotificationCount;

    const handleUnreadCountChange = useCallback((count: number) => {
        setNotificationCountOverride(count);
        if (notificationRefreshTimeoutRef.current !== null) {
            window.clearTimeout(notificationRefreshTimeoutRef.current);
        }
        notificationRefreshTimeoutRef.current = window.setTimeout(() => {
            notificationRefreshTimeoutRef.current = null;
            void refetchShellSummary();
        }, 150);
    }, [refetchShellSummary]);

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
    const navGroups = getGroupedSidebarNav({ authz, hasPermission }).map((section) => ({
        group: section.group,
        label: t(`groups.${section.group}`),
        items: section.items.map((route) => {
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
        }),
    }));

    // Resolve the single active item across all groups so `:id`/edit/detail
    // routes still highlight their nav item, and nested siblings like `/admin`
    // and `/admin/docs` never both light up (FR-P4-2, finding S3).
    const activeHref = resolveActiveSidebarHref(
        location.pathname,
        navGroups.flatMap((section) => section.items.map((item) => item.href)),
    );
    const navigationContentSignature = navGroups
        .map((section) => `${section.label}:${section.items.map((item) => item.label).join(',')}`)
        .join('|');

    useEffect(() => {
        const navigation = navigationRef.current;
        if (!navigation) return;
        measureNavigationOverflow();
        navigation.addEventListener('scroll', measureNavigationOverflow);
        window.addEventListener('resize', measureNavigationOverflow);
        const observer = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(measureNavigationOverflow);
        observer?.observe(navigation);
        for (const child of navigation.children) {
            observer?.observe(child);
        }
        return () => {
            navigation.removeEventListener('scroll', measureNavigationOverflow);
            window.removeEventListener('resize', measureNavigationOverflow);
            observer?.disconnect();
        };
    }, [measureNavigationOverflow, navigationContentSignature]);

    const handleNavItemFocus = (element: HTMLElement) => {
        element.scrollIntoView({ block: 'nearest' });
        measureNavigationOverflow();
    };

    const brandName = tCommon('brand.name');
    const brandAccentSuffix = 'Hub';
    const hasAccentSuffix = brandName.endsWith(brandAccentSuffix);
    const brandPrefix = hasAccentSuffix ? brandName.slice(0, -brandAccentSuffix.length) : brandName;

    return (
        <aside className="fixed inset-y-0 left-0 z-50 hidden lg:flex w-72 min-h-0 flex-col p-6">
            <div className="glass-card h-full min-h-0 flex flex-col p-4">
                <div className="mb-6 flex shrink-0 items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-accent p-2 rounded-xl">
                            <Shield className="h-6 w-6 text-accent-foreground" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-foreground font-heading">
                            {hasAccentSuffix ? (
                                <>
                                    {brandPrefix}
                                    <span className="text-accent-text">{brandAccentSuffix}</span>
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

                <div className="flex min-h-0 flex-1 flex-col">
                    <nav
                        ref={navigationRef}
                        aria-label={t('primary_navigation')}
                        className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
                    >
                        {navGroups.map((section) => (
                            <div
                                key={section.group}
                                role="group"
                                aria-labelledby={`sidebar-group-${section.group}`}
                                className="space-y-1"
                            >
                                <p
                                    id={`sidebar-group-${section.group}`}
                                    className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                    {section.label}
                                </p>
                                {section.items.map((item) => {
                                    const isActive = item.href === activeHref;
                                    return (
                                        <Link
                                            key={item.href}
                                            to={item.href}
                                            aria-current={isActive ? 'page' : undefined}
                                            onFocus={(event) => handleNavItemFocus(event.currentTarget)}
                                            className={cn(
                                                'group flex items-center justify-between px-3 py-3 text-sm font-medium rounded-xl transition-colors duration-200',
                                                isActive
                                                    ? 'sidebar-nav-link--active'
                                                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                                            )}
                                        >
                                            <div className="sidebar-nav-content flex items-center gap-3">
                                                <item.icon className={cn('sidebar-nav-icon h-5 w-5', isActive ? '' : 'text-icon-muted group-hover:text-foreground')} />
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
                            </div>
                        ))}
                    </nav>
                    {hasMoreDestinationsBelow ? (
                        <p
                            aria-live="polite"
                            className="pointer-events-none shrink-0 bg-gradient-to-t from-background/95 to-transparent px-2 pt-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
                        >
                            {t('more_destinations_below')}
                        </p>
                    ) : null}
                </div>

                <div className="mt-4 shrink-0 space-y-4 border-t border-white/10 pt-4">
                    {user && (
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                                <span className="text-xs font-bold text-accent-text">{user.name.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{user.role_display_name}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        data-testid="logout-button"
                        disabled={logoutPending}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
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
