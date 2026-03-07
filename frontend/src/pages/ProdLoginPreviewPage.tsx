import { ArrowRight, BadgeCheck, Building2, LockKeyhole, ShieldCheck } from 'lucide-react';

const assurancePoints = [
  'Microsoft Entra ID single sign-on',
  'Conditional access and MFA enforced upstream',
  'Least-privilege role mapping after identity verification',
];

const statusItems = [
  {
    label: 'Identity source',
    value: 'Corporate Microsoft tenant',
  },
  {
    label: 'Session policy',
    value: 'Managed by RiskHub and Entra controls',
  },
  {
    label: 'Environment',
    value: 'Production preview shell',
  },
];

export default function ProdLoginPreviewPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#04131f] text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(86,173,255,0.18),_transparent_34%),radial-gradient(circle_at_85%_15%,_rgba(10,214,188,0.16),_transparent_25%),radial-gradient(circle_at_50%_100%,_rgba(244,114,182,0.12),_transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0)_35%,rgba(255,255,255,0.03)_100%)]" />
        <div className="absolute left-[8%] top-24 h-72 w-72 rounded-full border border-cyan-300/10 bg-cyan-300/5 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-2rem] h-96 w-96 rounded-full border border-emerald-300/10 bg-emerald-300/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-10 lg:px-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.9fr] xl:gap-14">
          <section className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/85 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" />
              RiskHub production sign-in
            </div>

            <div className="mt-8 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-emerald-200/75">
                Enterprise risk operations
              </p>
              <h1 className="mt-4 max-w-xl text-5xl font-black leading-[0.96] text-white sm:text-6xl xl:text-7xl">
                One verified identity for every critical decision.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Production access routes through your corporate Microsoft account, then resolves RiskHub
                permissions from approved role assignments. No shared demo paths, no local shortcuts.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {statusItems.map((item) => (
                <article
                  key={item.label}
                  className="rounded-[28px] border border-white/10 bg-white/6 p-4 shadow-[0_18px_60px_rgba(4,19,31,0.35)] backdrop-blur-xl"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-3 text-sm font-medium leading-6 text-slate-100">
                    {item.value}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-10 rounded-[32px] border border-white/10 bg-slate-950/40 p-6 shadow-[0_24px_80px_rgba(2,8,14,0.45)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-400">
                    Access assurance
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    Auth flow mirrors the locked-down production entry point.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {assurancePoints.map((point) => (
                  <div key={point} className="flex items-start gap-3 rounded-2xl border border-white/6 bg-white/5 px-4 py-3">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <p className="text-sm leading-6 text-slate-200">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="relative">
            <div className="absolute inset-x-10 top-8 h-24 rounded-full bg-cyan-300/15 blur-3xl" aria-hidden="true" />
            <div className="relative rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,31,45,0.94),rgba(7,18,29,0.92))] p-6 shadow-[0_32px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/85">
                    Sign in
                  </p>
                  <h2 className="mt-3 text-3xl font-black text-white">
                    Continue with your organization account
                  </h2>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3 text-cyan-100">
                  <Building2 className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                This preview isolates the production SSO entry UI. Use it to judge spacing, hierarchy,
                and messaging without needing live auth configuration.
              </p>

              <div className="mt-8 rounded-[28px] border border-cyan-300/15 bg-cyan-300/8 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#185abc] shadow-[0_10px_30px_rgba(255,255,255,0.12)]">
                    <span className="text-xl font-black">M</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Microsoft Entra ID</p>
                    <p className="text-sm text-cyan-100/80">SSO provider configured for production access</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  Continue with Microsoft
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <p className="font-semibold text-white">Expected audience</p>
                  <p className="mt-2 leading-6">Employees with an imported directory identity and an active RiskHub role.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <p className="font-semibold text-white">Support path</p>
                  <p className="mt-2 leading-6">If access fails, contact your RiskHub administrator to confirm tenant assignment and app role mapping.</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-dashed border-white/12 px-4 py-3 text-xs uppercase tracking-[0.26em] text-slate-400">
                Preview route only. No live auth transaction is started from this page.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
