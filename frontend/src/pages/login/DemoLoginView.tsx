import { Building2, Loader2, Shield, User } from 'lucide-react';
import { AccountButton } from './AccountButton';
import type { DemoAccountGroups } from './loginPageTypes';

interface DemoLoginViewProps {
    showBootstrapUnavailableBanner: boolean;
    authActionUnavailableError: string | null;
    showConfigWarning: boolean;
    showSsoButton: boolean;
    isSsoLoading: boolean;
    isAnyDemoLoginLoading: boolean;
    loadingEmail: string | null;
    demoErrorMessage: string | null;
    demoAccounts: DemoAccountGroups;
    onDemoLogin: (email: string) => void;
    onSsoLogin: () => void;
    translate: (key: string) => string;
}

export function DemoLoginView({
    showBootstrapUnavailableBanner,
    authActionUnavailableError,
    showConfigWarning,
    showSsoButton,
    isSsoLoading,
    isAnyDemoLoginLoading,
    loadingEmail,
    demoErrorMessage,
    demoAccounts,
    onDemoLogin,
    onSsoLogin,
    translate,
}: DemoLoginViewProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 p-4">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                        RiskHub <span className="text-purple-400">{translate('login_demo.title_badge')}</span>
                    </h1>
                    <p className="text-slate-500 font-medium">{translate('login_demo.subtitle')}</p>
                </div>

                {showBootstrapUnavailableBanner ? (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm font-medium text-center">
                        {translate('login.unavailable_bootstrap_error')}
                    </div>
                ) : null}

                {authActionUnavailableError ? (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm font-medium text-center">
                        {authActionUnavailableError}
                    </div>
                ) : null}

                {showConfigWarning ? (
                    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm font-medium text-center">
                        {translate('login_demo.auth_config_unavailable')}
                    </div>
                ) : null}

                {showSsoButton ? (
                    <div className="mb-6 flex justify-center">
                        <button
                            onClick={onSsoLogin}
                            disabled={isSsoLoading || isAnyDemoLoginLoading}
                            className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-400/40 hover:bg-purple-400/5 transition-all text-sm font-bold text-white disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSsoLoading ? (
                                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                            ) : null}
                            {translate('login_sso.continue_with_microsoft')}
                        </button>
                    </div>
                ) : null}

                {demoErrorMessage ? (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-medium text-center">
                        {demoErrorMessage}
                    </div>
                ) : null}

                <div className="grid gap-6 md:grid-cols-3">
                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <Shield className="h-4 w-4 text-purple-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">{translate('login_demo.sections.privileged.title')}</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">{translate('login_demo.sections.privileged.description')}</p>
                        <div className="space-y-2">
                            {demoAccounts.privileged.map((account) => (
                                <AccountButton
                                    key={account.email}
                                    account={account}
                                    disabled={isAnyDemoLoginLoading}
                                    isLoading={loadingEmail === account.email}
                                    onSelect={onDemoLogin}
                                    translate={translate}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <Building2 className="h-4 w-4 text-amber-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">{translate('login_demo.sections.department_heads.title')}</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">{translate('login_demo.sections.department_heads.description')}</p>
                        <div className="space-y-2">
                            {demoAccounts.department_heads.map((account) => (
                                <AccountButton
                                    key={account.email}
                                    account={account}
                                    disabled={isAnyDemoLoginLoading}
                                    isLoading={loadingEmail === account.email}
                                    onSelect={onDemoLogin}
                                    translate={translate}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                            <User className="h-4 w-4 text-sky-400" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-widest">{translate('login_demo.sections.employees.title')}</h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mb-4 leading-relaxed">{translate('login_demo.sections.employees.description')}</p>
                        <div className="space-y-2">
                            {demoAccounts.employees.map((account) => (
                                <AccountButton
                                    key={account.email}
                                    account={account}
                                    disabled={isAnyDemoLoginLoading}
                                    isLoading={loadingEmail === account.email}
                                    onSelect={onDemoLogin}
                                    translate={translate}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <p className="text-center text-[10px] text-slate-600 mt-8 font-medium">
                    {translate('login_demo.footer_note')}
                </p>
            </div>
        </div>
    );
}
