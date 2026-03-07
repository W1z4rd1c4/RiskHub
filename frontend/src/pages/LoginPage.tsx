import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, Building2, User, ChevronRight, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { setAccessToken } from '@/services/accessTokenStore';
import type { AuthConfigResponse } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';
import { entraAuth } from '@/services/entraAuth';
import authEn from '@/i18n/locales/en/auth.json';
import authCs from '@/i18n/locales/cs/auth.json';
import errorKeysEn from '@/i18n/locales/en/errorKeys.json';
import errorKeysCs from '@/i18n/locales/cs/errorKeys.json';

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

type ProdLanguage = 'cs' | 'en';

const PROD_AUTH_COPY = {
    en: authEn.login_sso_prod,
    cs: authCs.login_sso_prod,
} as const;

const PROD_ERROR_COPY = {
    en: errorKeysEn,
    cs: errorKeysCs,
} as const;

export default function LoginPage() {
    const { t } = useTranslation(['auth', 'errorKeys', 'common']);
    const location = useLocation();
    const { returnTo, authErrorParam } = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return {
            returnTo: sanitizeReturnTo(params.get('returnTo')),
            authErrorParam: params.get('authError'),
        };
    }, [location.search]);

    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState<string>('');
    const [isSsoLoading, setIsSsoLoading] = useState(false);
    const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
    const [authConfigError, setAuthConfigError] = useState<string | null>(null);
    const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
    const [prodLanguage, setProdLanguage] = useState<ProdLanguage>('cs');
    const showBootstrapUnavailableBanner = authErrorParam === 'service_unavailable';

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthConfig(config);
            } catch (e) {
                if (cancelled) return;
                if (isAuthUnavailableError(e)) {
                    setAuthConfigError(t('login.unavailable_service_error'));
                } else {
                    setAuthConfigError(e instanceof Error ? e.message : t('login.unavailable_config_error'));
                }
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
    }, [t]);

    useEffect(() => {
        if (authConfig?.auth_mode !== 'microsoft_sso') return;

        const title = PROD_AUTH_COPY[prodLanguage].html_title;
        const previousTitle = document.title;
        const previousLang = document.documentElement.lang;

        document.title = title;
        document.documentElement.lang = prodLanguage;

        return () => {
            document.title = previousTitle;
            document.documentElement.lang = previousLang;
        };
    }, [authConfig?.auth_mode, prodLanguage]);

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
            setAccessToken(data.access_token);
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

    const prodCopy = PROD_AUTH_COPY[prodLanguage];
    const prodErrorMessage = errorKey
        ? PROD_ERROR_COPY[prodLanguage][errorKey.replace('errorKeys.', '') as keyof typeof errorKeysEn] ?? t(errorKey, { ns: 'errorKeys' })
        : '';

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

                {showBootstrapUnavailableBanner && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm font-medium text-center">
                        {t('login.unavailable_bootstrap_error')}
                    </div>
                )}

                {showConfigWarning && (
                    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm font-medium text-center">
                        {t('login_demo.auth_config_unavailable')}
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
        <div className="h-screen overflow-hidden bg-[#07111b] text-slate-100">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,rgba(56,189,248,0.16),transparent_26%),radial-gradient(circle_at_84%_18%,rgba(8,145,178,0.12),transparent_22%),linear-gradient(180deg,#07111b_0%,#09131f_100%)]"
            />

            <div className="relative mx-auto flex h-screen w-full max-w-[1320px] flex-col px-6 py-5 sm:px-8 lg:px-12">
                <header className="flex items-center justify-between py-3">
                    <div className="inline-flex items-center gap-4 text-slate-100">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-sky-400/20 bg-sky-400/10 text-sky-300 shadow-[0_12px_28px_rgba(14,165,233,0.12)]">
                            <Shield className="h-5 w-5" />
                        </span>
                        <span className="text-lg font-semibold tracking-[0.34em] uppercase">
                            Risk<span className="text-sky-300">Hub</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="hidden text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500 sm:inline">
                            {prodCopy.switch_label}
                        </span>
                        <div className="inline-flex rounded-full border border-white/10 bg-slate-950/60 p-1">
                            {(['cs', 'en'] as const).map((lang) => {
                                const active = lang === prodLanguage;
                                return (
                                    <button
                                        key={lang}
                                        type="button"
                                        onClick={() => setProdLanguage(lang)}
                                        aria-pressed={active}
                                        className={`min-w-12 rounded-full px-3 py-1.5 text-xs font-semibold tracking-[0.2em] transition-colors ${
                                            active
                                                ? 'bg-slate-100 text-slate-950'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        {lang.toUpperCase()}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                <section className="flex min-h-0 flex-1 items-center justify-center">
                    <div className="grid w-full max-w-[1180px] gap-12 py-6 lg:grid-cols-[minmax(0,1fr)_500px] lg:gap-20">
                        <div className="flex max-w-2xl flex-col justify-center">
                            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/80">
                                {prodCopy.eyebrow}
                            </div>
                            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.01] text-white sm:text-5xl lg:text-[4.2rem]">
                                {prodCopy.title}
                            </h1>
                            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
                                {prodCopy.description}
                            </p>
                            <p className="mt-4 max-w-xl text-base leading-7 text-slate-500">
                                {prodCopy.detail}
                            </p>
                        </div>

                        <div className="flex items-center justify-end">
                            <section className="w-full max-w-[500px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,21,31,0.98),rgba(8,16,26,0.96))] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.42)] backdrop-blur sm:p-10">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                                    {prodCopy.sign_in_label}
                                </p>

                                {showBootstrapUnavailableBanner ? (
                                    <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-300">
                                        {t('login.unavailable_bootstrap_error')}
                                    </div>
                                ) : null}

                                <div className="mt-6 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(9,21,34,0.96),rgba(8,17,27,0.98))] p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#185abc] text-xl font-bold shadow-[0_12px_28px_rgba(255,255,255,0.08)]">
                                            M
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/70">
                                                {prodCopy.provider_label}
                                            </p>
                                            <h2 className="mt-2 text-[1.45rem] font-semibold text-white">{prodCopy.card_title}</h2>
                                        </div>
                                    </div>

                                    <p className="mt-5 text-base leading-7 text-slate-300">{prodCopy.card_body}</p>

                                    <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-slate-400">
                                        {prodCopy.security_note}
                                    </div>

                                    {errorKey ? (
                                        <div className="mt-5 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-300">
                                            {prodErrorMessage}
                                        </div>
                                    ) : null}

                                    {authConfig?.sso.enabled ? (
                                        <button
                                            onClick={handleSsoLogin}
                                            disabled={isSsoLoading}
                                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-base font-semibold text-slate-950 transition-colors hover:bg-white disabled:opacity-60"
                                        >
                                            {isSsoLoading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : null}
                                            {prodCopy.button_label}
                                            <ArrowRight className="h-4 w-4" />
                                        </button>
                                    ) : (
                                        <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-4 text-sm leading-6 text-rose-300">
                                            {authConfig?.sso_error || prodCopy.not_configured}
                                        </div>
                                    )}

                                    <p className="mt-4 text-center text-sm leading-6 text-slate-500">
                                        {prodCopy.button_hint}
                                    </p>
                                </div>

                                <p className="mt-5 text-xs uppercase tracking-[0.28em] text-slate-600">
                                    {prodCopy.preview_note}
                                </p>
                            </section>
                        </div>
                    </div>
                </section>
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
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
                <div className="w-full max-w-md text-center space-y-4">
                    <h1 className="text-xl font-bold mb-2">{t('login.unavailable_title')}</h1>
                    <p className="text-sm text-slate-300">{authConfigError || t('login.unavailable_config_error')}</p>
                    <p className="text-sm text-slate-500">{t('login.unavailable_retry_hint')}</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
                    >
                        {t('common:actions.retry')}
                    </button>
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
                <h1 className="text-xl font-bold mb-2">{t('login.not_configured_title')}</h1>
                <p className="text-sm text-slate-300">
                    {t('login.not_configured_description')}
                </p>
            </div>
        </div>
    );
}
