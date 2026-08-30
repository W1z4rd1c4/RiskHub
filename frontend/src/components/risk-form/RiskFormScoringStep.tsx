import { useId } from 'react';

import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { IMPACT_DESCRIPTIONS, PROBABILITY_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import type { Risk } from '@/types/risk';

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface RiskFormScoringStepProps {
  t: TranslateFn;
  formData: Partial<Risk>;
  totalAssets: number | null;
  handleInputChange: (field: keyof Risk, value: unknown) => void;
  getScoreTextColor: (score: number) => string;
  getSliderAccent: (score: number) => string;
}

export function RiskFormScoringStep({
  t,
  formData,
  totalAssets,
  handleInputChange,
  getScoreTextColor,
  getSliderAccent,
}: RiskFormScoringStepProps) {
  const acceptanceHintId = useId();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h4 className={`text-[10px] font-black uppercase tracking-widest ${getScoreTextColor((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}>{t('risks:fields.gross_score')} ({t('risks:scoring.inherent_risk')})</h4>
          <div className="space-y-4">
            <Field
              label={(
                <>
                  <span>{t('risks:fields.gross_probability')}</span>
                  <span aria-hidden="true" className="text-foreground">{formData.gross_probability} / 5</span>
                </>
              )}
              labelClassName="flex w-full justify-between text-xs font-bold text-muted-foreground uppercase"
              help={formData.gross_probability && PROBABILITY_DESCRIPTIONS[formData.gross_probability] ? (
                <>
                  <span className={`font-semibold ${getScoreTextColor((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}>
                    {t(PROBABILITY_DESCRIPTIONS[formData.gross_probability].labelKey, PROBABILITY_DESCRIPTIONS[formData.gross_probability].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(PROBABILITY_DESCRIPTIONS[formData.gross_probability].descriptionKey, PROBABILITY_DESCRIPTIONS[formData.gross_probability].descriptionKey)}
                </>
              ) : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="range" min="1" max="5" step="1"
                  value={formData.gross_probability}
                  onChange={(e) => handleInputChange('gross_probability', parseInt(e.target.value, 10))}
                  className={`w-full ${getSliderAccent((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}
                />
              )}
            </Field>
            <Field
              label={(
                <>
                  <span>{t('risks:fields.gross_impact')}</span>
                  <span aria-hidden="true" className="text-foreground">{formData.gross_impact} / 5</span>
                </>
              )}
              labelClassName="flex w-full justify-between text-xs font-bold text-muted-foreground uppercase"
              help={formData.gross_impact && IMPACT_DESCRIPTIONS[formData.gross_impact] ? (
                <>
                  <span className={`font-semibold ${getScoreTextColor((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}>
                    {t(IMPACT_DESCRIPTIONS[formData.gross_impact].labelKey, IMPACT_DESCRIPTIONS[formData.gross_impact].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(IMPACT_DESCRIPTIONS[formData.gross_impact].descriptionKey, IMPACT_DESCRIPTIONS[formData.gross_impact].descriptionKey)}.
                  <span className="text-muted-foreground ml-1">
                    {t('form.financial.loss')}:{' '}
                    {totalAssets == null
                      ? t('form.financial.no_loss')
                      : formatFinancialRange(formData.gross_impact ?? 1, totalAssets, t('form.financial.no_loss'))}
                  </span>
                </>
              ) : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="range" min="1" max="5" step="1"
                  value={formData.gross_impact}
                  onChange={(e) => handleInputChange('gross_impact', parseInt(e.target.value, 10))}
                  className={`w-full ${getSliderAccent((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}
                />
              )}
            </Field>
          </div>

          <RiskScoreMatrix
            probability={formData.gross_probability || 1}
            impact={formData.gross_impact || 1}
            type="gross"
            size="large"
            onSelect={(p, i) => {
              handleInputChange('gross_probability', p);
              handleInputChange('gross_impact', i);
            }}
          />
        </section>

        <section className="space-y-6">
          <h4 className={`text-[10px] font-black uppercase tracking-widest ${getScoreTextColor((formData.net_probability || 1) * (formData.net_impact || 1))}`}>{t('risks:fields.net_score')} ({t('risks:scoring.residual_risk')})</h4>
          <div className="space-y-4">
            <Field
              label={(
                <>
                  <span>{t('risks:fields.net_probability')}</span>
                  <span aria-hidden="true" className="text-foreground">{formData.net_probability} / 5</span>
                </>
              )}
              labelClassName="flex w-full justify-between text-xs font-bold text-muted-foreground uppercase"
              help={formData.net_probability && PROBABILITY_DESCRIPTIONS[formData.net_probability] ? (
                <>
                  <span className={`font-semibold ${getScoreTextColor((formData.net_probability || 1) * (formData.net_impact || 1))}`}>
                    {t(PROBABILITY_DESCRIPTIONS[formData.net_probability].labelKey, PROBABILITY_DESCRIPTIONS[formData.net_probability].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(PROBABILITY_DESCRIPTIONS[formData.net_probability].descriptionKey, PROBABILITY_DESCRIPTIONS[formData.net_probability].descriptionKey)}
                </>
              ) : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="range" min="1" max="5" step="1"
                  value={formData.net_probability}
                  onChange={(e) => handleInputChange('net_probability', parseInt(e.target.value, 10))}
                  className={`w-full ${getSliderAccent((formData.net_probability || 1) * (formData.net_impact || 1))}`}
                />
              )}
            </Field>
            <Field
              label={(
                <>
                  <span>{t('risks:fields.net_impact')}</span>
                  <span aria-hidden="true" className="text-foreground">{formData.net_impact} / 5</span>
                </>
              )}
              labelClassName="flex w-full justify-between text-xs font-bold text-muted-foreground uppercase"
              help={formData.net_impact && IMPACT_DESCRIPTIONS[formData.net_impact] ? (
                <>
                  <span className={`font-semibold ${getScoreTextColor((formData.net_probability || 1) * (formData.net_impact || 1))}`}>
                    {t(IMPACT_DESCRIPTIONS[formData.net_impact].labelKey, IMPACT_DESCRIPTIONS[formData.net_impact].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(IMPACT_DESCRIPTIONS[formData.net_impact].descriptionKey, IMPACT_DESCRIPTIONS[formData.net_impact].descriptionKey)}.
                  <span className="text-muted-foreground ml-1">
                    {t('form.financial.loss')}:{' '}
                    {totalAssets == null
                      ? t('form.financial.no_loss')
                      : formatFinancialRange(formData.net_impact ?? 1, totalAssets, t('form.financial.no_loss'))}
                  </span>
                </>
              ) : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="range" min="1" max="5" step="1"
                  value={formData.net_impact}
                  onChange={(e) => handleInputChange('net_impact', parseInt(e.target.value, 10))}
                  className={`w-full ${getSliderAccent((formData.net_probability || 1) * (formData.net_impact || 1))}`}
                />
              )}
            </Field>
          </div>

          <RiskScoreMatrix
            probability={formData.net_probability || 1}
            impact={formData.net_impact || 1}
            type="net"
            size="large"
            onSelect={(p, i) => {
              handleInputChange('net_probability', p);
              handleInputChange('net_impact', i);
            }}
          />
        </section>
      </div>

      {/* ICT Register acceptance governance (issue #47) — entered fields; the
          required-together rule above tolerance is a DQ finding, never a
          client-side block. */}
      <section className="space-y-4 border-t border-white/10 pt-6" data-testid="risk-acceptance-section">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {t('risks:acceptance.title')}
        </h4>
        <div className="grid md:grid-cols-3 gap-6">
          <Field label={t('risks:acceptance.approver')} labelClassName="text-xs font-bold text-muted-foreground uppercase">
            {(field) => (
              <Input
                {...field}
                aria-describedby={acceptanceHintId}
                type="text"
                data-testid="risk-acceptance-approver"
                value={formData.acceptance_approver ?? ''}
                onChange={(e) => handleInputChange('acceptance_approver', e.target.value || null)}
              />
            )}
          </Field>
          <Field label={t('risks:acceptance.date')} labelClassName="text-xs font-bold text-muted-foreground uppercase">
            {(field) => (
              <Input
                {...field}
                aria-describedby={acceptanceHintId}
                type="date"
                data-testid="risk-acceptance-date"
                value={formData.acceptance_date ?? ''}
                onChange={(e) => handleInputChange('acceptance_date', e.target.value || null)}
              />
            )}
          </Field>
          <Field
            label={t('risks:acceptance.justification')}
            className="md:col-span-3"
            labelClassName="text-xs font-bold text-muted-foreground uppercase"
          >
            {(field) => (
              <textarea
                {...field}
                aria-describedby={acceptanceHintId}
                rows={2}
                data-testid="risk-acceptance-justification"
                value={formData.acceptance_justification ?? ''}
                onChange={(e) => handleInputChange('acceptance_justification', e.target.value || null)}
                className="w-full rounded-xl border border-input bg-input/40 px-4 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-accent/50 resize-y"
              />
            )}
          </Field>
        </div>
        <p id={acceptanceHintId} className="text-xs text-muted-foreground">{t('risks:acceptance.hint')}</p>
      </section>
    </div>
  );
}
