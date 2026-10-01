import { Search, Target, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { ControlEffectiveness } from '@/types/risk';
import { useControlRiskLinkStep } from './controlRiskLinkStepContext';
import { LoadingState } from '@/components/ui/state';

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface ControlFormRiskLinkStepProps {
  t: TranslateFn;
}

export function ControlFormRiskLinkStep({
  t,
}: ControlFormRiskLinkStepProps) {
  const {
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
  } = useControlRiskLinkStep();

  return (
    <div>
      <h3 className="text-[10px] font-black text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
        <Target className="h-4 w-4 text-accent" />
        {t('controls:form.labels.link_to_risk_optional')}
      </h3>

      {selectedRisk ? (
        <div className="space-y-6">
          <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">{selectedRisk.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{selectedRisk.process} • {selectedRisk.category || t('controls:form.labels.uncategorized')}</p>
                <p className="text-xs text-foreground mt-2 italic">{selectedRisk.description}</p>
                {selectedRisk.department_name && (
                  <span className="inline-block mt-3 px-2 py-0.5 rounded bg-tint/10 text-[10px] uppercase font-bold text-foreground">
                    {selectedRisk.department_name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRiskId(undefined)}
                aria-label={t('common:actions.clear_selection_named', { name: selectedRisk.name })}
                className="p-2 hover:bg-tint/10 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">{t('controls:form.labels.effectiveness')}</label>
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
            {/* PG-37: "(optional)" via Field. Pending W6 (D5): ControlCreateDialog is still a
                dark surface, so the field keeps the step's label and text colours until then. */}
            <Field
              label={t('common:labels.notes')}
              optional
              labelClassName="block text-[10px] font-black text-muted-foreground uppercase tracking-widest"
            >
              {(field) => (
                <Textarea
                  {...field}
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.target.value)}
                  className="border-border bg-tint/5 text-foreground"
                  placeholder={t('form.placeholders.link_rationale')}
                />
              )}
            </Field>
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

          <Input
            type="text"
            leadingIcon={Search}
            aria-label={t('form.placeholders.search_risks')}
            placeholder={t('form.placeholders.search_risks')}
            value={riskSearch}
            onChange={(e) => setRiskSearch(e.target.value)}
          />

          <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border divide-y divide-border custom-scrollbar">
            {isLoadingRisks ? (
              <LoadingState className="p-8" label={t('common:loading.risk_data')} />
            ) : risks.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {t('common:empty.no_risks_found')}
              </div>
            ) : filteredRisks.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
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
                  <div className="bg-tint/5 rounded-lg p-3 w-[200px] shrink-0 flex flex-col justify-center group-hover:bg-tint/10 transition-colors">
                    <p className="text-sm font-bold text-foreground truncate" title={risk.name}>{risk.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate" title={risk.process}>{risk.process}</p>
                  </div>

                  <div className="bg-tint/5 rounded-lg p-3 flex-1 flex items-center group-hover:bg-tint/10 transition-colors">
                    {risk.description ? (
                      <p className="text-[10px] text-muted-foreground break-words leading-tight">
                        {risk.description.length > 120
                          ? `${risk.description.slice(0, 120)}...`
                          : risk.description}
                      </p>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">{t('common:empty.no_description')}</span>
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
