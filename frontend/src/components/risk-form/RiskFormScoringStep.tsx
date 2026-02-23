import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
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
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h4 className={`text-[10px] font-black uppercase tracking-widest ${getScoreTextColor((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}>{t('risks:fields.gross_score')} ({t('risks:scoring.inherent_risk')})</h4>
          <div className="space-y-4">
            <div>
              <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                <span>{t('risks:fields.probability')}</span>
                <span className="text-white">{formData.gross_probability} / 5</span>
              </label>
              <input
                type="range" min="1" max="5" step="1"
                value={formData.gross_probability}
                onChange={(e) => handleInputChange('gross_probability', parseInt(e.target.value, 10))}
                className={`w-full ${getSliderAccent((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}
              />
              {formData.gross_probability && PROBABILITY_DESCRIPTIONS[formData.gross_probability] && (
                <p className="text-xs text-slate-400 mt-1">
                  <span className={`font-semibold ${getScoreTextColor((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}>
                    {t(PROBABILITY_DESCRIPTIONS[formData.gross_probability].labelKey, PROBABILITY_DESCRIPTIONS[formData.gross_probability].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(PROBABILITY_DESCRIPTIONS[formData.gross_probability].descriptionKey, PROBABILITY_DESCRIPTIONS[formData.gross_probability].descriptionKey)}
                </p>
              )}
            </div>
            <div>
              <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                <span>{t('risks:fields.impact')}</span>
                <span className="text-white">{formData.gross_impact} / 5</span>
              </label>
              <input
                type="range" min="1" max="5" step="1"
                value={formData.gross_impact}
                onChange={(e) => handleInputChange('gross_impact', parseInt(e.target.value, 10))}
                className={`w-full ${getSliderAccent((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}
              />
              {formData.gross_impact && IMPACT_DESCRIPTIONS[formData.gross_impact] && (
                <p className="text-xs text-slate-400 mt-1">
                  <span className={`font-semibold ${getScoreTextColor((formData.gross_probability || 1) * (formData.gross_impact || 1))}`}>
                    {t(IMPACT_DESCRIPTIONS[formData.gross_impact].labelKey, IMPACT_DESCRIPTIONS[formData.gross_impact].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(IMPACT_DESCRIPTIONS[formData.gross_impact].descriptionKey, IMPACT_DESCRIPTIONS[formData.gross_impact].descriptionKey)}.
                  <span className="text-slate-500 ml-1">
                    {t('form.financial.loss')}:{' '}
                    {totalAssets == null
                      ? t('form.financial.no_loss')
                      : formatFinancialRange(formData.gross_impact ?? 1, totalAssets, t('form.financial.no_loss'))}
                  </span>
                </p>
              )}
            </div>
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
            <div>
              <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                <span>{t('risks:fields.probability')}</span>
                <span className="text-white">{formData.net_probability} / 5</span>
              </label>
              <input
                type="range" min="1" max="5" step="1"
                value={formData.net_probability}
                onChange={(e) => handleInputChange('net_probability', parseInt(e.target.value, 10))}
                className={`w-full ${getSliderAccent((formData.net_probability || 1) * (formData.net_impact || 1))}`}
              />
              {formData.net_probability && PROBABILITY_DESCRIPTIONS[formData.net_probability] && (
                <p className="text-xs text-slate-400 mt-1">
                  <span className={`font-semibold ${getScoreTextColor((formData.net_probability || 1) * (formData.net_impact || 1))}`}>
                    {t(PROBABILITY_DESCRIPTIONS[formData.net_probability].labelKey, PROBABILITY_DESCRIPTIONS[formData.net_probability].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(PROBABILITY_DESCRIPTIONS[formData.net_probability].descriptionKey, PROBABILITY_DESCRIPTIONS[formData.net_probability].descriptionKey)}
                </p>
              )}
            </div>
            <div>
              <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                <span>{t('risks:fields.impact')}</span>
                <span className="text-white">{formData.net_impact} / 5</span>
              </label>
              <input
                type="range" min="1" max="5" step="1"
                value={formData.net_impact}
                onChange={(e) => handleInputChange('net_impact', parseInt(e.target.value, 10))}
                className={`w-full ${getSliderAccent((formData.net_probability || 1) * (formData.net_impact || 1))}`}
              />
              {formData.net_impact && IMPACT_DESCRIPTIONS[formData.net_impact] && (
                <p className="text-xs text-slate-400 mt-1">
                  <span className={`font-semibold ${getScoreTextColor((formData.net_probability || 1) * (formData.net_impact || 1))}`}>
                    {t(IMPACT_DESCRIPTIONS[formData.net_impact].labelKey, IMPACT_DESCRIPTIONS[formData.net_impact].labelKey)}
                  </span>
                  <span className="mx-1">—</span>
                  {t(IMPACT_DESCRIPTIONS[formData.net_impact].descriptionKey, IMPACT_DESCRIPTIONS[formData.net_impact].descriptionKey)}.
                  <span className="text-slate-500 ml-1">
                    {t('form.financial.loss')}:{' '}
                    {totalAssets == null
                      ? t('form.financial.no_loss')
                      : formatFinancialRange(formData.net_impact ?? 1, totalAssets, t('form.financial.no_loss'))}
                  </span>
                </p>
              )}
            </div>
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
    </div>
  );
}
