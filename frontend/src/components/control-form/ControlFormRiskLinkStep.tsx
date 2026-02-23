import { Search, Target, X } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { ControlEffectiveness, RiskSummary } from '@/types/risk';

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface ControlFormRiskLinkStepProps {
  t: TranslateFn;
  selectedRisk?: RiskSummary;
  setSelectedRiskId: (value: number | undefined) => void;
  riskEffectiveness: ControlEffectiveness;
  setRiskEffectiveness: (value: ControlEffectiveness) => void;
  linkNotes: string;
  setLinkNotes: (value: string) => void;
  selectedDept: string;
  setSelectedDept: (value: string) => void;
  selectedProcess: string;
  setSelectedProcess: (value: string) => void;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  uniqueDepartments: string[];
  uniqueProcesses: string[];
  uniqueCategories: string[];
  riskSearch: string;
  setRiskSearch: (value: string) => void;
  isLoadingRisks: boolean;
  risks: RiskSummary[];
  filteredRisks: RiskSummary[];
}

export function ControlFormRiskLinkStep({
  t,
  selectedRisk,
  setSelectedRiskId,
  riskEffectiveness,
  setRiskEffectiveness,
  linkNotes,
  setLinkNotes,
  selectedDept,
  setSelectedDept,
  selectedProcess,
  setSelectedProcess,
  selectedCategory,
  setSelectedCategory,
  uniqueDepartments,
  uniqueProcesses,
  uniqueCategories,
  riskSearch,
  setRiskSearch,
  isLoadingRisks,
  risks,
  filteredRisks,
}: ControlFormRiskLinkStepProps) {
  return (
    <div>
      <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
        <Target className="h-4 w-4 text-accent" />
        {t('controls:form.labels.link_to_risk_optional')}
      </h3>

      {selectedRisk ? (
        <div className="space-y-6">
          <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">{selectedRisk.name}</p>
                <p className="text-xs text-slate-400 mt-1">{selectedRisk.process} • {selectedRisk.category || t('controls:form.labels.uncategorized')}</p>
                <p className="text-xs text-slate-300 mt-2 italic">{selectedRisk.description}</p>
                {selectedRisk.department_name && (
                  <span className="inline-block mt-3 px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase font-bold text-slate-300">
                    {selectedRisk.department_name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRiskId(undefined)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.effectiveness')}</label>
              <ThemedSelect
                value={riskEffectiveness}
                onValueChange={(v) => setRiskEffectiveness(v as ControlEffectiveness)}
                className="w-full"
                options={[
                  { value: 'high', label: t('controls:form.effectiveness.high') },
                  { value: 'medium', label: t('controls:form.effectiveness.medium') },
                  { value: 'low', label: t('controls:form.effectiveness.low') },
                ]}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('common:labels.notes')} ({t('common:labels.none')})</label>
              <input
                type="text"
                value={linkNotes}
                onChange={(e) => setLinkNotes(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                placeholder={t('form.placeholders.link_rationale')}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ThemedSelect
              value={selectedDept}
              onValueChange={setSelectedDept}
              placeholder={t('form.placeholders.all_departments')}
              allowEmpty
              emptyLabel={t('form.placeholders.all_departments')}
              options={uniqueDepartments.map((d) => ({ value: d, label: d }))}
            />

            <ThemedSelect
              value={selectedProcess}
              onValueChange={setSelectedProcess}
              placeholder={t('form.placeholders.all_processes')}
              allowEmpty
              emptyLabel={t('form.placeholders.all_processes')}
              options={uniqueProcesses.map((p) => ({ value: p, label: p }))}
            />

            <ThemedSelect
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              placeholder={t('form.placeholders.all_categories')}
              allowEmpty
              emptyLabel={t('form.placeholders.all_categories')}
              options={uniqueCategories.map((c) => ({ value: c, label: c }))}
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder={t('form.placeholders.search_risks')}
              value={riskSearch}
              onChange={(e) => setRiskSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-400"
            />
          </div>

          <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
            {isLoadingRisks ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2"></div>
                {t('common:loading.risk_data')}
              </div>
            ) : risks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                {t('common:empty.no_risks_found')}
              </div>
            ) : filteredRisks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                {t('common:labels.no_results')}
              </div>
            ) : (
              filteredRisks.slice(0, 20).map((risk) => (
                <button
                  key={risk.id}
                  type="button"
                  onClick={() => setSelectedRiskId(risk.id)}
                  className="w-full text-left hover:brightness-125 transition-all flex items-stretch gap-2 group p-2"
                >
                  <div className="bg-white/5 rounded-lg p-3 w-[200px] shrink-0 flex flex-col justify-center group-hover:bg-white/10 transition-colors">
                    <p className="text-sm font-bold text-white truncate" title={risk.name}>{risk.name}</p>
                    <p className="text-[10px] text-slate-500 mt-1 truncate" title={risk.process}>{risk.process}</p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3 flex-1 flex items-center group-hover:bg-white/10 transition-colors">
                    {risk.description ? (
                      <p className="text-[10px] text-slate-400 break-words leading-tight">
                        {risk.description.length > 120
                          ? `${risk.description.slice(0, 120)}...`
                          : risk.description}
                      </p>
                    ) : (
                      <span className="text-[10px] text-slate-600 italic">{t('common:empty.no_description')}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
