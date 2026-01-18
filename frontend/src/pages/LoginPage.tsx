import { useState } from 'react';
import { Shield, Building2, User, ChevronRight, Loader2 } from 'lucide-react';

// Demo accounts organized by tier - IDs match database
const DEMO_ACCOUNTS = {
    privileged: [
        { id: 1, name: 'System Admin', role: 'Administrator', email: 'admin@riskhub.local', color: 'rose' },
        { id: 2, name: 'Anna Kowalski', role: 'Chief Risk Officer', email: 'cro@riskhub.local', color: 'purple' },
        { id: 3, name: 'Petra Svobodová', role: 'Risk Manager', email: 'risk.manager@riskhub.local', color: 'violet' },
    ],
    department_heads: [
        { id: 4, name: 'Eva Králová', role: 'Department Head', email: 'ops.head@riskhub.local', dept: 'Operations', color: 'amber' },
        { id: 5, name: 'Martin Procházka', role: 'Department Head', email: 'fin.head@riskhub.local', dept: 'Finance', color: 'emerald' },
        { id: 6, name: 'Tomáš Novotný', role: 'Department Head', email: 'it.head@riskhub.local', dept: 'IT', color: 'sky' },
    ],
    employees: [
        { id: 7, name: 'Jana Horáková', role: 'Control Owner', email: 'ops.analyst@riskhub.local', dept: 'Operations', color: 'amber' },
        { id: 8, name: 'Lukáš Dvořák', role: 'Control Owner', email: 'fin.analyst@riskhub.local', dept: 'Finance', color: 'emerald' },
        { id: 9, name: 'Barbora Němcová', role: 'Control Owner', email: 'it.analyst@riskhub.local', dept: 'IT', color: 'sky' },
    ],
};

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState<number | null>(null);
    const [error, setError] = useState('');

    const handleDemoLogin = async (userId: number) => {
        setError('');
        setIsLoading(userId);

        try {
            // Use mock auth via special demo login
            const response = await fetch(`/api/v1/auth/demo-login/${userId}`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Demo login failed');
            }

            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setIsLoading(null);
        }
    };

    const AccountButton = ({ account }: { account: typeof DEMO_ACCOUNTS.privileged[0] }) => {
        // Static class mappings for hover states - Tailwind can scan these
        const colorClasses = {
            rose: 'hover:border-rose-400/50 hover:bg-rose-400/5',
            purple: 'hover:border-purple-400/50 hover:bg-purple-400/5',
            violet: 'hover:border-violet-400/50 hover:bg-violet-400/5',
            amber: 'hover:border-amber-400/50 hover:bg-amber-400/5',
            emerald: 'hover:border-emerald-400/50 hover:bg-emerald-400/5',
            sky: 'hover:border-sky-400/50 hover:bg-sky-400/5',
            teal: 'hover:border-teal-400/50 hover:bg-teal-400/5',
            indigo: 'hover:border-indigo-400/50 hover:bg-indigo-400/5',
            pink: 'hover:border-pink-400/50 hover:bg-pink-400/5',
        };

        // Static badge class mappings - prevents Tailwind purge issues
        const badgeClasses = {
            rose: 'bg-rose-400/10 border-rose-400/20 text-rose-400',
            purple: 'bg-purple-400/10 border-purple-400/20 text-purple-400',
            violet: 'bg-violet-400/10 border-violet-400/20 text-violet-400',
            amber: 'bg-amber-400/10 border-amber-400/20 text-amber-400',
            emerald: 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400',
            sky: 'bg-sky-400/10 border-sky-400/20 text-sky-400',
            teal: 'bg-teal-400/10 border-teal-400/20 text-teal-400',
            indigo: 'bg-indigo-400/10 border-indigo-400/20 text-indigo-400',
            pink: 'bg-pink-400/10 border-pink-400/20 text-pink-400',
        };

        return (
            <button
                onClick={() => handleDemoLogin(account.id)}
                disabled={isLoading !== null}
                className={`w-full p-3 flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl transition-all group disabled:opacity-50 ${colorClasses[account.color as keyof typeof colorClasses]}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${badgeClasses[account.color as keyof typeof badgeClasses]}`}>
                        {account.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-bold text-white">{account.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{account.role}</p>
                    </div>
                </div>
                {isLoading === account.id ? (
                    <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors" />
                )}
            </button>
        );
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 p-4">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                        RiskHub <span className="text-purple-400">Demo</span>
                    </h1>
                    <p className="text-slate-500 font-medium">Select an account to explore different permission levels</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-medium text-center">
                        {error}
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                    {/* Privileged Tier */}
                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <Shield className="h-4 w-4 text-purple-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">Privileged</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">Full access to all resources, approval rights, and system settings.</p>
                        <div className="space-y-2">
                            {DEMO_ACCOUNTS.privileged.map(account => (
                                <AccountButton key={account.id} account={account} />
                            ))}
                        </div>
                    </div>

                    {/* Department Heads */}
                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <Building2 className="h-4 w-4 text-amber-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">Department Heads</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">Write access scoped to their department. Can create and manage controls.</p>
                        <div className="space-y-2">
                            {DEMO_ACCOUNTS.department_heads.map(account => (
                                <AccountButton key={account.id} account={account} />
                            ))}
                        </div>
                    </div>

                    {/* Employees */}
                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <User className="h-4 w-4 text-sky-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">Employees</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">Control owners with limited access. Changes require approval.</p>
                        <div className="space-y-2">
                            {DEMO_ACCOUNTS.employees.map(account => (
                                <AccountButton key={account.id} account={account} />
                            ))}
                        </div>
                    </div>
                </div>

                <p className="text-center text-[10px] text-slate-600 mt-8 font-medium">
                    This is a demo environment. All data is synthetic and resets periodically.
                </p>
            </div>
        </div>
    );
}

