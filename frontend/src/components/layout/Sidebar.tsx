import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    ClipboardList,
    ShieldAlert,
    Building2,
    Settings,
    Shield,
    ChevronRight,
} from 'lucide-react';

const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Controls', href: '/controls', icon: ClipboardList },
    { name: 'Risk Register', href: '/risks', icon: ShieldAlert },
    { name: 'Departments', href: '/departments', icon: Building2 },
    { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
    const location = useLocation();

    return (
        <aside className="hidden lg:flex w-72 flex-col p-6 h-screen">
            <div className="glass-card h-full flex flex-col p-4">
                <div className="flex items-center gap-3 px-2 mb-10">
                    <div className="bg-accent p-2 rounded-xl">
                        <Shield className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white font-heading">
                        Risk<span className="text-accent">Hub</span>
                    </span>
                </div>

                <nav className="flex-1 space-y-2">
                    {navigation.map((item) => {
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
                                {isActive && <ChevronRight className="h-4 w-4" />}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto pt-6 border-t border-white/10">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Live Environment
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
