import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    ClipboardList,
    ShieldAlert,
    Target,
    Building2,
    Settings,
    Shield,
    ChevronRight,
    History,
    LogOut,
    Users as UsersIcon,
    ClipboardCheck,
    Scale
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { approvalsApi } from '@/services/approvalsApi';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Controls', href: '/controls', icon: ClipboardList },
    { name: 'Risks', href: '/risks', icon: ShieldAlert },
    { name: 'Risk Appetite', href: '/kris', icon: Target },
    { name: 'Departments', href: '/departments', icon: Building2 },
    { name: 'Governance', href: '/governance', icon: Scale },
    { name: 'Audit Trail', href: '/audit-trail', icon: History },
    { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { canManageUsers } = usePermissions();
    const [pendingCount, setPendingCount] = useState(0);
    const [orphanCount, setOrphanCount] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [approvalsRes, orphansRes] = await Promise.all([
                    approvalsApi.getPendingCount(),
                    orphanedItemsApi.getOrphanStats()
                ]);
                setPendingCount(approvalsRes.count);
                setOrphanCount(orphansRes.total_count);
            } catch (error) {
                console.error('Failed to fetch counts:', error);
            }
        };

        // Fetch immediately on mount
        fetchData();

        // Then poll every 60 seconds
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []); // Only fetch once on mount + polling

    const handleLogout = () => {
        logout();
        navigate('/landing');
    };

    const workflowItem = {
        name: 'Workflow',
        href: '/approvals',
        icon: ClipboardCheck,
        badge: pendingCount > 0 ? pendingCount : undefined
    };

    const adminItems = canManageUsers
        ? [
            { name: 'User Management', href: '/users', icon: UsersIcon },
        ]
        : [];

    const navigationWithBadges = navigation.map(item => {
        if (item.href === '/governance') {
            // Only show orphan count badge for users who can manage orphaned items
            // Regular employees can't resolve orphaned items so badge would be misleading
            const showBadge = canManageUsers && orphanCount > 0;
            return { ...item, badge: showBadge ? orphanCount : undefined };
        }
        return item;
    });

    const filteredNavigation = [
        navigationWithBadges[0], // Dashboard
        workflowItem,
        ...navigationWithBadges.slice(1),
        ...adminItems,
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

                <nav className="flex-1 space-y-2">
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
                                {(item as any).badge && (
                                    <span className="bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {(item as any).badge}
                                    </span>
                                )}
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
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all duration-200"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </div>
        </aside>
    );
}
