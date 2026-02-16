import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, Building2, User, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import type { AuthConfigResponse } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { entraAuth } from '@/services/entraAuth';

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

function sanitizeReturnTo(value: string | null | undefined): string {
    if (!value) return '/';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    return '/';
}

export default function LoginPage() {
    const { t } = useTranslation(['auth', 'errorKeys', 'common']);
    const location = useLocation();
    const returnTo = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return sanitizeReturnTo(params.get('returnTo'));
    }, [location.search]);

    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState<string>('');
    const [isSsoLoading, setIsSsoLoading] = useState(false);
    const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
    const [authConfigError, setAuthConfigError] = useState<string | null>(null);
    const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthConfig(config);
            } catch (e) {
                if (cancelled) return;
                setAuthConfigError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!cancelled) {
                    setIsAuthConfigLoading(false);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleDemoLogin = async (email: string) => {
        setErrorKey('');
        setIsLoading(email);

        try {
            const response = await fetch('/api/v1/auth/demo-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            if (!response.ok) {
                throw new Error('errorKeys.demo_login_failed');
            }

            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            window.location.assign(returnTo);
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('errorKeys.')) {
                setErrorKey(err.message);
            } else {
                setErrorKey('errorKeys.login_failed');
            }
        } finally {
            setIsLoading(null);
        }
    };

    const handleSsoLogin = async () => {
        setErrorKey('');
        setIsSsoLoading(true);

        try {
            await entraAuth.loginRedirect(returnTo);
        } catch (err) {
            console.error(err);
            setErrorKey('errorKeys.login_failed');
        } finally {
            // In production `loginRedirect()` navigates away, but keep the UI consistent in tests.
            setIsSsoLoading(false);
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
                onClick={() => handleDemoLogin(account.email)}
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
                {isLoading === account.email ? (
                    <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors" />
                )}
            </button>
        );
    };

    const DemoLoginView = ({
        showSsoButton,
        showConfigWarning,
    }: {
        showSsoButton: boolean;
        showConfigWarning: boolean;
    }) => (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 p-4">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                        RiskHub <span className="text-purple-400">{t('login_demo.title_badge')}</span>
                    </h1>
                    <p className="text-slate-500 font-medium">{t('login_demo.subtitle')}</p>
                </div>

                {showConfigWarning && (
                    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm font-medium text-center">
                        Auth config unavailable; showing demo login (development fallback).
                    </div>
                )}

                {showSsoButton && (
                    <div className="mb-6 flex justify-center">
                        <button
                            onClick={handleSsoLogin}
                            disabled={isSsoLoading || isLoading !== null}
                            className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-400/40 hover:bg-purple-400/5 transition-all text-sm font-bold text-white disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSsoLoading ? (
                                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                            ) : null}
                            {t('login_sso.continue_with_microsoft')}
                        </button>
                    </div>
                )}

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

    const SsoOnlyView = () => (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                        RiskHub
                    </h1>
                    <p className="text-slate-500 font-medium">Sign in with your Microsoft account</p>
                </div>

                {errorKey && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-medium text-center">
                        {t(errorKey, { ns: 'errorKeys' })}
                    </div>
                )}

                {authConfig?.sso.enabled ? (
                    <button
                        onClick={handleSsoLogin}
                        disabled={isSsoLoading}
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-400/40 hover:bg-purple-400/5 transition-all text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSsoLoading ? (
                            <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                        ) : null}
                        {t('login_sso.continue_with_microsoft')}
                    </button>
                ) : (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm font-medium text-center">
                        {authConfig?.sso_error || 'SSO is not configured.'}
                    </div>
                )}
            </div>
        </div>
    );

    if (isAuthConfigLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('loading.generic', { ns: 'common' })}
                </div>
            </div>
        );
    }

    if (authConfigError || !authConfig) {
        if (import.meta.env.DEV) {
            return <DemoLoginView showSsoButton={false} showConfigWarning={true} />;
        }
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
                <div className="w-full max-w-md text-center">
                    <h1 className="text-xl font-bold mb-2">Login unavailable</h1>
                    <p className="text-sm text-slate-300">{authConfigError || 'Failed to load auth config'}</p>
                </div>
            </div>
        );
    }

    if (authConfig.auth_mode === 'microsoft_sso') {
        return <SsoOnlyView />;
    }

    if (authConfig.auth_mode === 'hybrid_dev') {
        return <DemoLoginView showSsoButton={Boolean(authConfig.sso.enabled)} showConfigWarning={false} />;
    }

    // auth_mode=password (or any unexpected state): only show demo UI if explicitly enabled.
    if (authConfig.demo_login_enabled) {
        return <DemoLoginView showSsoButton={Boolean(authConfig.sso.enabled)} showConfigWarning={false} />;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
            <div className="w-full max-w-md text-center">
                <h1 className="text-xl font-bold mb-2">Login not configured</h1>
                <p className="text-sm text-slate-300">
                    Demo login is disabled. Configure SSO (AUTH_MODE=microsoft_sso) or enable hybrid_dev for demo login.
                </p>
            </div>
        </div>
    );
}
