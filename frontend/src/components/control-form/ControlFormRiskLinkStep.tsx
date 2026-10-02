import { Search, Target, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RiskPickerOption } from '@/components/risks/RiskPickerOption';
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
      <h2 className="text-eyebrow mb-4 flex items-center gap-2">
        <Target className="h-4 w-4 text-accent-text" aria-hidden="true" />
        {t('controls:form.labels.link_to_risk_optional')}
      </h2>

      {selectedRisk ? (
        <div className="space-y-6">
          <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">{selectedRisk.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{selectedRisk.process} • {selectedRisk.category || t('common:fallbacks.uncategorized')}</p>
                <p className="text-xs text-foreground mt-2 italic">{selectedRisk.description}</p>
                {selectedRisk.department_name && (
                  <Badge size="sm" shape="rounded" className="mt-3">
                    {selectedRisk.department_name}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="iconCompact"
                onClick={() => setSelectedRiskId(undefined)}
                aria-label={t('common:actions.clear_selection_named', { name: selectedRisk.name })}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Field label={t('controls:form.labels.effectiveness')}>
              {(field) => (
                <ThemedSelect
                  {...field}
                  value={riskEffectiveness}
                  onValueChange={(v) => setRiskEffectiveness(v as ControlEffectiveness)}
                  className="w-full"
                  options={[
                    { value: 'high', label: t('controls:form.effectiveness.high') },
                    { value: 'medium', label: t('controls:form.effectiveness.medium') },
                    { value: 'low', label: t('controls:form.effectiveness.low') },
                  ]}
                />
              )}
            </Field>
            {/* PG-37: "(optional)" via Field. */}
            <Field label={t('common:labels.notes')} optional>
              {(field) => (
                <Textarea
                  {...field}
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.target.value)}
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
              triggerAriaLabel={t('common:labels.department')}
              onValueChange={setSelectedDept}
              placeholder={t('form.placeholders.all_departments')}
              allowEmpty
              emptyLabel={t('form.placeholders.all_departments')}
              options={uniqueDepartments.map((d) => ({ value: d, label: d }))}
            />

            <ThemedSelect
              value={selectedProcess}
              triggerAriaLabel={t('common:labels.process')}
              onValueChange={setSelectedProcess}
              placeholder={t('form.placeholders.all_processes')}
              allowEmpty
              emptyLabel={t('form.placeholders.all_processes')}
              options={uniqueProcesses.map((p) => ({ value: p, label: p }))}
            />

            <ThemedSelect
              value={selectedCategory}
              triggerAriaLabel={t('common:labels.category')}
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
                <RiskPickerOption key={risk.id} risk={risk} onSelect={() => setSelectedRiskId(risk.id)} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
