import { useState } from 'react';
import { Shield, Building2, User, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

// Demo accounts organized by tier - IDs match database
const DEMO_ACCOUNTS = {
    privileged: [
        { id: 1, name: 'System Admin', roleKey: 'auth:login_demo.roles.administrator', email: 'admin@riskhub.local', color: 'rose' },
        { id: 2, name: 'Anna Kowalski', roleKey: 'auth:login_demo.roles.chief_risk_officer', email: 'cro@riskhub.local', color: 'purple' },
        { id: 3, name: 'Petra Svobodová', roleKey: 'auth:login_demo.roles.risk_manager', email: 'risk.manager@riskhub.local', color: 'violet' },
    ],
    department_heads: [
        { id: 4, name: 'Eva Králová', roleKey: 'auth:login_demo.roles.department_head', email: 'ops.head@riskhub.local', deptKey: 'auth:login_demo.departments.operations', color: 'amber' },
        { id: 5, name: 'Martin Procházka', roleKey: 'auth:login_demo.roles.department_head', email: 'fin.head@riskhub.local', deptKey: 'auth:login_demo.departments.finance', color: 'emerald' },
        { id: 6, name: 'Tomáš Novotný', roleKey: 'auth:login_demo.roles.department_head', email: 'it.head@riskhub.local', deptKey: 'auth:login_demo.departments.it', color: 'sky' },
    ],
    employees: [
        { id: 7, name: 'Jana Horáková', roleKey: 'auth:login_demo.roles.control_owner', email: 'ops.analyst@riskhub.local', deptKey: 'auth:login_demo.departments.operations', color: 'amber' },
        { id: 8, name: 'Lukáš Dvořák', roleKey: 'auth:login_demo.roles.control_owner', email: 'fin.analyst@riskhub.local', deptKey: 'auth:login_demo.departments.finance', color: 'emerald' },
        { id: 9, name: 'Barbora Němcová', roleKey: 'auth:login_demo.roles.control_owner', email: 'it.analyst@riskhub.local', deptKey: 'auth:login_demo.departments.it', color: 'sky' },
    ],
};

export default function LoginPage() {
    const { t } = useTranslation(['auth', 'errorKeys']);
    const [isLoading, setIsLoading] = useState<number | null>(null);
    const [errorKey, setErrorKey] = useState<string>('');

    const handleDemoLogin = async (userId: number) => {
        setErrorKey('');
        setIsLoading(userId);

        try {
            // Use mock auth via special demo login
            const response = await fetch(`/api/v1/auth/demo-login/${userId}`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('errorKeys.demo_login_failed');
            }

            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            window.location.href = '/';
        } catch (err) {
            const message = err instanceof Error ? err.message : 'errorKeys.login_failed';
            setErrorKey(message.startsWith('errorKeys.') ? message : 'errorKeys.login_failed');
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
                        <p className="text-[10px] text-slate-500 font-medium">{t(account.roleKey)}</p>
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
                        RiskHub <span className="text-purple-400">{t('login_demo.title_badge')}</span>
                    </h1>
                    <p className="text-slate-500 font-medium">{t('login_demo.subtitle')}</p>
                </div>

                {errorKey && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-medium text-center">
                        {t(errorKey, { ns: 'errorKeys' })}
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                    {/* Privileged Tier */}
                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <Shield className="h-4 w-4 text-purple-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">{t('login_demo.sections.privileged.title')}</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">{t('login_demo.sections.privileged.description')}</p>
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
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">{t('login_demo.sections.department_heads.title')}</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">{t('login_demo.sections.department_heads.description')}</p>
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
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">{t('login_demo.sections.employees.title')}</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">{t('login_demo.sections.employees.description')}</p>
                        <div className="space-y-2">
                            {DEMO_ACCOUNTS.employees.map(account => (
                                <AccountButton key={account.id} account={account} />
                            ))}
                        </div>
                    </div>
                </div>

                <p className="text-center text-[10px] text-slate-600 mt-8 font-medium">
                    {t('login_demo.footer_note')}
                </p>
            </div>
        </div>
    );
}
