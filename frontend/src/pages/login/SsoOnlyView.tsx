import { ArrowRight, Loader2, Shield } from 'lucide-react';
import type { ProdAuthCopy, ProdLanguage } from './loginPageTypes';

interface SsoOnlyViewProps {
    showBootstrapUnavailableBanner: boolean;
    prodCopy: ProdAuthCopy;
    prodErrorMessage: string;
    prodLanguage: ProdLanguage;
    isSsoLoading: boolean;
    ssoEnabled: boolean;
    ssoError?: string | null;
    onChangeLanguage: (language: ProdLanguage) => void;
    onSsoLogin: () => void;
    translate: (key: string) => string;
}

export function SsoOnlyView({
    showBootstrapUnavailableBanner,
    prodCopy,
    prodErrorMessage,
    prodLanguage,
    isSsoLoading,
    ssoEnabled,
    ssoError,
    onChangeLanguage,
    onSsoLogin,
    translate,
}: SsoOnlyViewProps) {
    return (
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
                            {(['cs', 'en'] as const).map((language) => {
                                const active = language === prodLanguage;
                                return (
                                    <button
                                        key={language}
                                        type="button"
                                        onClick={() => onChangeLanguage(language)}
                                        aria-pressed={active}
                                        className={`min-w-12 rounded-full px-3 py-1.5 text-xs font-semibold tracking-[0.2em] transition-colors ${
                                            active ? 'bg-slate-100 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        {language.toUpperCase()}
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
                            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">{prodCopy.description}</p>
                            <p className="mt-4 max-w-xl text-base leading-7 text-slate-500">{prodCopy.detail}</p>
                        </div>

                        <div className="flex items-center justify-end">
                            <section className="w-full max-w-[500px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,21,31,0.98),rgba(8,16,26,0.96))] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.42)] backdrop-blur sm:p-10">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                                    {prodCopy.sign_in_label}
                                </p>

                                {showBootstrapUnavailableBanner ? (
                                    <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-300">
                                        {translate('login.unavailable_bootstrap_error')}
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

                                    {prodErrorMessage ? (
                                        <div className="mt-5 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-300">
                                            {prodErrorMessage}
                                        </div>
                                    ) : null}

                                    {ssoEnabled ? (
                                        <button
                                            onClick={onSsoLogin}
                                            disabled={isSsoLoading}
                                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-base font-semibold text-slate-950 transition-colors hover:bg-white disabled:opacity-60"
                                        >
                                            {isSsoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            {prodCopy.button_label}
                                            <ArrowRight className="h-4 w-4" />
                                        </button>
                                    ) : (
                                        <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-4 text-sm leading-6 text-rose-300">
                                            {ssoError || prodCopy.not_configured}
                                        </div>
                                    )}

                                    <p className="mt-4 text-center text-sm leading-6 text-slate-500">{prodCopy.button_hint}</p>
                                </div>

                                <p className="mt-5 text-xs uppercase tracking-[0.28em] text-slate-600">{prodCopy.preview_note}</p>
                            </section>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
