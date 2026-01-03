import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
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
    Server,
    Bell
} from 'lucide-react';

const navigation = [
    { name: 'Dashboard', href: '#', icon: LayoutDashboard },
    { name: 'Workflow', href: '#', icon: ClipboardCheck },
    { name: 'Controls', href: '#', icon: ClipboardList },
    { name: 'Risks', href: '#', icon: ShieldAlert },
    { name: 'Risk Appetite', href: '#', icon: Target },
    { name: 'Departments', href: '#', icon: Building2 },
    { name: 'Audit Trail', href: '#', icon: History },
    { name: 'Settings', href: '#', icon: Settings },
];

const adminItems = [
    { name: 'User Management', href: '#', icon: UsersIcon },
    { name: 'Directory Emulator', href: '/', icon: Server, isActive: true },
];

export function Sidebar() {
    const location = useLocation();

    return (
        <aside className="hidden lg:flex w-72 flex-col p-6 h-screen sticky top-0">
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
                    <div className="relative">
                        <Bell className="h-5 w-5 text-slate-500 hover:text-white cursor-pointer transition-colors" />
                    </div>
                </div>

                <nav className="flex-1 space-y-2">
                    {navigation.map((item) => (
                        <div
                            key={item.name}
                            className="group flex items-center justify-between px-3 py-3 text-sm font-medium rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all cursor-not-allowed opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <item.icon className="h-5 w-5 text-slate-500" />
                                {item.name}
                            </div>
                        </div>
                    ))}

                    <div className="pt-4 mt-4 border-t border-white/10 hidden">Admin</div>

                    {adminItems.map((item) => {
                        const isActive = item.isActive;
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
                                {isActive && <ChevronRight className="h-4 w-4" />}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto pt-6 border-t border-white/10 space-y-4">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-accent">S</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">System Admin</p>
                            <p className="text-xs text-slate-500 truncate">Administrator</p>
                        </div>
                    </div>
                    <button
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
