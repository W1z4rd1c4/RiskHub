import type { Dispatch, SetStateAction } from 'react';
import { AlertCircle, Plus } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { Risk } from '@/types/risk';
import { resolveRiskTypeCode } from './riskTypeDefaults';

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface RiskTypeOption {
  code: string;
  display_name: string;
}

interface RiskFormIdentityStepProps {
  t: TranslateFn;
  formData: Partial<Risk>;
  fieldErrors: Record<string, string>;
  riskTypes: RiskTypeOption[];
  riskTypesLoading: boolean;
  existingProcesses: string[];
  existingCategories: string[];
  subprocessesByProcess: Record<string, string[]>;
  showProcessDropdown: boolean;
  showSubprocessDropdown: boolean;
  showCategoryDropdown: boolean;
  setShowProcessDropdown: Dispatch<SetStateAction<boolean>>;
  setShowSubprocessDropdown: Dispatch<SetStateAction<boolean>>;
  setShowCategoryDropdown: Dispatch<SetStateAction<boolean>>;
  handleInputChange: (field: keyof Risk, value: unknown) => void;
}

export function RiskFormIdentityStep({
  t,
  formData,
  fieldErrors,
  riskTypes,
  riskTypesLoading,
  existingProcesses,
  existingCategories,
  subprocessesByProcess,
  showProcessDropdown,
  showSubprocessDropdown,
  showCategoryDropdown,
  setShowProcessDropdown,
  setShowSubprocessDropdown,
  setShowCategoryDropdown,
  handleInputChange,
}: RiskFormIdentityStepProps) {
  const selectedRiskType = resolveRiskTypeCode(formData.risk_type, riskTypes);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
          {t('risks:fields.name')} <span className="text-rose-400">*</span>
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all ${fieldErrors.name ? 'border-rose-500' : 'border-white/10'
            }`}
          placeholder={t('form.placeholders.name')}
        />
        {fieldErrors.name && (
          <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {fieldErrors.name}
          </p>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('risks:form.labels.risk_type')}</label>
          <ThemedSelect
            value={selectedRiskType}
            onValueChange={(v) => handleInputChange('risk_type', v)}
            disabled={riskTypesLoading}
            className="w-full"
            options={riskTypes.map((rt) => ({ value: rt.code, label: rt.display_name }))}
          />
        </div>
        <div className="relative">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {t('risks:form.labels.main_process')} <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.process}
              onChange={(e) => {
                handleInputChange('process', e.target.value);
                setShowProcessDropdown(true);
              }}
              onFocus={() => setShowProcessDropdown(true)}
              onBlur={() => setTimeout(() => setShowProcessDropdown(false), 150)}
              className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all ${fieldErrors.process ? 'border-rose-500' : 'border-white/10'
                }`}
              placeholder={t('form.placeholders.type_or_select')}
            />
            {showProcessDropdown && existingProcesses.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-sm divide-y divide-white/5">
                {existingProcesses
                  .filter((p) => !formData.process || p.toLowerCase().includes(formData.process.toLowerCase()))
                  .map((process) => (
                    <button
                      key={process}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleInputChange('process', process);
                        setShowProcessDropdown(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      {process}
                    </button>
                  ))}
                {formData.process && !existingProcesses.includes(formData.process) && (
                  <div className="px-4 py-2.5 text-xs text-slate-400 flex items-center gap-2">
                    <Plus className="h-3 w-3" />
                    {t('risks:form.labels.create_value', { value: formData.process })}
                  </div>
                )}
              </div>
            )}
          </div>
          {fieldErrors.process && (
            <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {fieldErrors.process}
            </p>
          )}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="relative">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('risks:form.labels.subprocess_optional')}</label>
          <div className="relative">
            <input
              type="text"
              value={formData.subprocess || ''}
              onChange={(e) => {
                handleInputChange('subprocess', e.target.value);
                setShowSubprocessDropdown(true);
              }}
              onFocus={() => setShowSubprocessDropdown(true)}
              onBlur={() => setTimeout(() => setShowSubprocessDropdown(false), 150)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
              placeholder={formData.process ? t('form.placeholders.subprocess_of', { process: formData.process }) : t('form.placeholders.select_process_first')}
            />
            {showSubprocessDropdown && formData.process && (subprocessesByProcess[formData.process]?.length || formData.subprocess) && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-sm divide-y divide-white/5">
                {(subprocessesByProcess[formData.process] || [])
                  .filter((s) => !formData.subprocess || s.toLowerCase().includes(formData.subprocess.toLowerCase()))
                  .map((subprocess) => (
                    <button
                      key={subprocess}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleInputChange('subprocess', subprocess);
                        setShowSubprocessDropdown(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      {subprocess}
                    </button>
                  ))}
                {formData.subprocess && !(subprocessesByProcess[formData.process] || []).includes(formData.subprocess) && (
                  <div className="px-4 py-2.5 text-xs text-slate-400 flex items-center gap-2">
                    <Plus className="h-3 w-3" />
                    {t('risks:form.labels.create_value', { value: formData.subprocess })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="relative">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {t('common:labels.category')} <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => {
                handleInputChange('category', e.target.value);
                setShowCategoryDropdown(true);
              }}
              onFocus={() => setShowCategoryDropdown(true)}
              onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 150)}
              className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all ${fieldErrors.category ? 'border-rose-500' : 'border-white/10'
                }`}
              placeholder={t('form.placeholders.type_or_select')}
            />
            {showCategoryDropdown && existingCategories.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-sm divide-y divide-white/5">
                {existingCategories
                  .filter((c) => !formData.category || c.toLowerCase().includes(formData.category.toLowerCase()))
                  .map((category) => (
                    <button
                      key={category}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleInputChange('category', category);
                        setShowCategoryDropdown(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      {category}
                    </button>
                  ))}
                {formData.category && !existingCategories.includes(formData.category) && (
                  <div className="px-4 py-2.5 text-xs text-slate-400 flex items-center gap-2">
                    <Plus className="h-3 w-3" />
                    {t('risks:form.labels.create_value', { value: formData.category })}
                  </div>
                )}
              </div>
            )}
          </div>
          {fieldErrors.category && (
            <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {fieldErrors.category}
            </p>
          )}
        </div>
      </div>
      <div>
        <label htmlFor="risk-description" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
          {t('risks:form.labels.risk_description')} <span className="text-rose-400">*</span>
        </label>
        <textarea
          id="risk-description"
          name="description"
          data-testid="risk-description-input"
          rows={3}
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          aria-invalid={fieldErrors.description ? 'true' : 'false'}
          className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all resize-none ${fieldErrors.description ? 'border-rose-500' : 'border-white/10'
            }`}
          placeholder={t('form.placeholders.description')}
        />
        {fieldErrors.description && (
          <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {fieldErrors.description}
          </p>
        )}
      </div>
    </div>
  );
}
