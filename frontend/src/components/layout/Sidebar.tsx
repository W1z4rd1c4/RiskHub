import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    ClipboardList,
    ShieldAlert,
    Target,
    Handshake,
    Building2,
    Settings,
    Shield,
    ChevronRight,
    LogOut,
    Users as UsersIcon,
    ClipboardCheck,
    Scale,
    Activity,
    Command,
    Server,
    BookOpen
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthz } from '@/authz/useAuthz';
import { approvalsApi } from '@/services/approvalsApi';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SIDEBAR_POLL_MS } from '@/config/constants';

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { canManageAccess, canViewActivityLog, hasPermission } = usePermissions();
    const authz = useAuthz();
    const { t } = useTranslation('navigation');
    const [workflowCount, setWorkflowCount] = useState(0);
    const [orphanCount, setOrphanCount] = useState(0);

    // Navigation items with translation keys
    const navigation = [
        { name: t('sidebar.dashboard'), href: '/', icon: LayoutDashboard },
        { name: t('sidebar.controls'), href: '/controls', icon: ClipboardList },
        { name: t('sidebar.risks'), href: '/risks', icon: ShieldAlert },
        { name: t('sidebar.kris'), href: '/kris', icon: Target },
        ...(hasPermission('vendors', 'read') ? [{ name: t('sidebar.vendors'), href: '/vendors', icon: Handshake }] : []),
        { name: t('sidebar.departments'), href: '/departments', icon: Building2 },
        { name: t('sidebar.governance'), href: '/governance', icon: Scale },
        { name: t('sidebar.settings'), href: '/settings', icon: Settings },
    ];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [approvalsRes, orphansRes, questionnaireInbox] = await Promise.all([
                    approvalsApi.getPendingCount(),
                    orphanedItemsApi.getOrphanStats(),
                    riskQuestionnairesApi.inbox(),
                ]);
                setWorkflowCount(approvalsRes.count + questionnaireInbox.length);
                setOrphanCount(orphansRes.total_count);
            } catch (error) {
                console.error('Failed to fetch counts:', error);
            }
        };

        if (!user) return;

        // Fetch immediately on mount
        fetchData();

        // Then poll every 60 seconds
        const interval = setInterval(fetchData, SIDEBAR_POLL_MS);
        return () => clearInterval(interval);
    }, [user?.id]); // Fetch on login/user change + polling

    const handleLogout = () => {
        logout();
        navigate('/landing');
    };

    const workflowItem = {
        name: t('sidebar.approvals'),
        href: '/approvals',
        icon: ClipboardCheck,
        badge: workflowCount > 0 ? workflowCount : undefined
    };

    // Access Management visible to admins, privileged users, and department heads
    const userManagementItem = authz.canViewUsersPage
        ? { name: t('sidebar.users'), href: '/users', icon: UsersIcon }
        : null;

    const navigationWithBadges = navigation.map(item => {
        if (item.href === '/governance') {
            // Only show orphan count badge for users who can manage orphaned items
            // Regular employees can't resolve orphaned items so badge would be misleading
            const showBadge = canManageAccess && orphanCount > 0;
            return { ...item, badge: showBadge ? orphanCount : undefined };
        }
        return item;
    });

    const activityLogItem = {
        name: t('sidebar.activity_log'),
        href: '/activity-log',
        icon: Activity,
    };

    // Risk Hub visible only to CRO
    const riskHubItem = authz.canViewRiskHub ? {
        name: t('sidebar.risk_hub'),
        href: '/risk-hub',
        icon: Command,
    } : null;

    // Admin Console visible only to Admin
    const adminConsoleItem = authz.canViewAdminConsole ? {
        name: t('sidebar.admin'),
        href: '/admin',
        icon: Server,
    } : null;

    const documentationItem = authz.canViewAdminConsole ? {
        name: t('sidebar.documentation'),
        href: '/admin/docs',
        icon: BookOpen,
    } : null;

    // Admin only sees: Settings, Access Management, Admin Console
    // Everyone else sees the full business navigation
    const isAdmin = authz.isPlatformAdmin;

    const dashboardItem = navigationWithBadges.find((i) => i.href === '/');
    const settingsItem = navigationWithBadges.find((i) => i.href === '/settings');
    const businessItems = navigationWithBadges.filter((i) => i.href !== '/' && i.href !== '/settings');

    const filteredNavigation = isAdmin
        ? [
            // Admin-only navigation (no business data)
            ...(settingsItem ? [settingsItem] : []),
            ...(userManagementItem ? [userManagementItem] : []),
            ...(adminConsoleItem ? [adminConsoleItem] : []),
            ...(documentationItem ? [documentationItem] : []),
        ]
        : [
            // Business user navigation
            ...(dashboardItem ? [dashboardItem] : []),
            workflowItem,
            ...businessItems, // Controls, Risks, KRIs, Vendors, Departments, Governance
            ...(canViewActivityLog ? [activityLogItem] : []),
            ...(settingsItem ? [settingsItem] : []),
            ...(userManagementItem ? [userManagementItem] : []),
            ...(riskHubItem ? [riskHubItem] : []),
        ];

    return (
        <aside className="fixed inset-y-0 left-0 z-50 hidden lg:flex w-72 flex-col p-6">
            <div className="glass-card h-full flex flex-col p-4">
                <div className="flex items-center justify-between px-2 mb-10">
                    <div className="flex items-center gap-3">
                        <div className="bg-accent p-2 rounded-xl">
                            <Shield className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white font-heading">
                            Risk<span className="text-accent">Hub</span>
                        </span>
                    </div>
                    <NotificationBell />
                </div>

                <nav className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {filteredNavigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={cn(
                                    'group flex items-center justify-between px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                                    isActive
                                        ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon className={cn('h-5 w-5', isActive ? 'text-white' : 'text-slate-500 group-hover:text-white')} />
                                    {item.name}
                                </div>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {(item as any).badge && (
                                    <span className="bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {(item as any).badge}
                                    </span>
                                )}
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {isActive && !(item as any).badge && <ChevronRight className="h-4 w-4" />}
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
                                <p className="text-xs text-slate-500 truncate">{user.role_display_name}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        data-testid="logout-button"
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all duration-200"
                    >
                        <LogOut className="h-4 w-4" />
                        {t('user_menu.logout')}
                    </button>
                </div>
            </div>
        </aside>
    );
}
