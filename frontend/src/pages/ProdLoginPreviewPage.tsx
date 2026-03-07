import { useEffect, useState } from 'react';
import { ArrowRight, Shield, Sparkles } from 'lucide-react';

type PreviewLanguage = 'cs' | 'en';

type PreviewCopy = {
  htmlTitle: string;
  switchLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  signInLabel: string;
  cardTitle: string;
  cardBody: string;
  providerLabel: string;
  securityNote: string;
  buttonLabel: string;
  buttonHint: string;
  previewNote: string;
};

const copy: Record<PreviewLanguage, PreviewCopy> = {
  cs: {
    htmlTitle: 'RiskHub Produkční Přihlášení',
    switchLabel: 'Jazyk',
    eyebrow: 'Platforma pro řízení rizik a governance',
    title: 'RiskHub spojuje rizika, kontroly a schvalování do jednoho pracovního toku.',
    description:
      'RiskHub pomáhá týmům řídit rizika, kontroly, schvalování a governance workflow na jednom místě.',
    detail:
      'Produkční přístup vede přes firemní Microsoft účet a po ověření identity naváže oprávnění podle role v RiskHubu.',
    signInLabel: 'Přihlášení',
    cardTitle: 'Pokračovat přes Microsoft',
    cardBody:
      'Bezpečné jednotné přihlášení pro interní uživatele RiskHubu v produkčním prostředí.',
    providerLabel: 'Microsoft Entra ID',
    securityNote: 'SSO pro firemní účty s mapováním oprávnění podle role.',
    buttonLabel: 'Pokračovat s Microsoft',
    buttonHint: 'Náhled pouze. Spuštění SSO je na této stránce vypnuté.',
    previewNote: 'Samostatný produkční náhled přihlášení bez aktivní autentizace.',
  },
  en: {
    htmlTitle: 'RiskHub Production Sign In',
    switchLabel: 'Language',
    eyebrow: 'Risk and governance operating system',
    title: 'RiskHub brings risks, controls, and approvals into one operating flow.',
    description:
      'RiskHub helps teams manage risks, controls, approvals, and governance workflows in one place.',
    detail:
      'Production access runs through your corporate Microsoft account and then maps permissions from your RiskHub role.',
    signInLabel: 'Sign in',
    cardTitle: 'Continue with Microsoft',
    cardBody:
      'Secure single sign-on for internal RiskHub users in the production environment.',
    providerLabel: 'Microsoft Entra ID',
    securityNote: 'SSO for corporate accounts with role-based permission mapping.',
    buttonLabel: 'Continue with Microsoft',
    buttonHint: 'Preview only. Live SSO is disabled on this page.',
    previewNote: 'Standalone production login preview with no active authentication.',
  },
};

const languageLabels: Record<PreviewLanguage, string> = {
  cs: 'CZ',
  en: 'EN',
};

export default function ProdLoginPreviewPage() {
  const [language, setLanguage] = useState<PreviewLanguage>('cs');
  const content = copy[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = content.htmlTitle;
  }, [content.htmlTitle, language]);

  return (
    <main className="h-screen overflow-hidden bg-[#07111b] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(14,116,144,0.12),transparent_26%),linear-gradient(180deg,#07111b_0%,#091521_100%)]" />
        <div className="absolute inset-y-0 left-[16%] w-px bg-gradient-to-b from-transparent via-sky-400/12 to-transparent" />
      </div>

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
              {content.switchLabel}
            </span>
            <div className="inline-flex rounded-full border border-white/10 bg-slate-950/60 p-1">
              {(['cs', 'en'] as const).map((lang) => {
                const active = lang === language;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    aria-pressed={active}
                    className={`min-w-12 rounded-full px-3 py-1.5 text-xs font-semibold tracking-[0.2em] transition-colors ${
                      active
                        ? 'bg-slate-100 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {languageLabels[lang]}
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
                <Sparkles className="h-3.5 w-3.5" />
                {content.eyebrow}
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.01] text-white sm:text-5xl lg:text-[4.2rem]">
                {content.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
                {content.description}
              </p>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-500">
                {content.detail}
              </p>
            </div>

            <div className="flex items-center justify-end">
              <section className="w-full max-w-[500px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,21,31,0.98),rgba(8,16,26,0.96))] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.42)] backdrop-blur sm:p-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                  {content.signInLabel}
                </p>

                <div className="mt-6 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(9,21,34,0.96),rgba(8,17,27,0.98))] p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#185abc] text-xl font-bold shadow-[0_12px_28px_rgba(255,255,255,0.08)]">
                      M
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/70">
                        {content.providerLabel}
                      </p>
                      <h2 className="mt-2 text-[1.45rem] font-semibold text-white">{content.cardTitle}</h2>
                    </div>
                  </div>

                  <p className="mt-5 text-base leading-7 text-slate-300">{content.cardBody}</p>
                  <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-slate-400">
                    {content.securityNote}
                  </div>

                  <button
                    type="button"
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-base font-semibold text-slate-950 transition-colors hover:bg-white"
                  >
                    {content.buttonLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <p className="mt-4 text-center text-sm leading-6 text-slate-500">
                    {content.buttonHint}
                  </p>
                </div>

                <p className="mt-5 text-xs uppercase tracking-[0.28em] text-slate-600">
                  {content.previewNote}
                </p>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
