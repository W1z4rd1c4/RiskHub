import { AlertCircle } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { CreatableCombobox } from '@/components/ui/CreatableCombobox';
import { Field } from '@/components/ui/field';
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
  handleInputChange,
}: RiskFormIdentityStepProps) {
  const selectedRiskType = resolveRiskTypeCode(formData.risk_type, riskTypes);
  const processError = fieldErrors.process ? t(fieldErrors.process, fieldErrors.process) : undefined;
  const categoryError = fieldErrors.category ? t(fieldErrors.category, fieldErrors.category) : undefined;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
          {t('risks:fields.name')} <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className={`w-full bg-input/40 border rounded-xl px-4 py-3 text-foreground outline-none focus:border-accent/50 transition-all ${fieldErrors.name ? 'border-destructive' : 'border-input'
            }`}
          placeholder={t('form.placeholders.name')}
        />
        {fieldErrors.name && (
          <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {fieldErrors.name}
          </p>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">{t('risks:form.labels.risk_type')}</label>
          <ThemedSelect
            value={selectedRiskType}
            onValueChange={(v) => handleInputChange('risk_type', v)}
            disabled={riskTypesLoading}
            className="w-full"
            options={riskTypes.map((rt) => ({ value: rt.code, label: rt.display_name }))}
          />
        </div>
        <Field
          label={t('risks:form.labels.main_process')}
          required
          error={processError}
          labelClassName="block text-[10px] font-black text-muted-foreground uppercase tracking-widest"
        >
          {(field) => (
            <CreatableCombobox
              {...field}
              value={formData.process || ''}
              suggestions={existingProcesses}
              onValueChange={(value) => handleInputChange('process', value)}
              placeholder={t('form.placeholders.type_or_select')}
              createValueLabel={formData.process
                ? t('risks:form.labels.create_value', { value: formData.process })
                : undefined}
            />
          )}
        </Field>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field
          label={t('risks:form.labels.subprocess_optional')}
          labelClassName="block text-[10px] font-black text-muted-foreground uppercase tracking-widest"
        >
          {(field) => (
            <CreatableCombobox
              {...field}
              value={formData.subprocess || ''}
              suggestions={formData.process ? subprocessesByProcess[formData.process] || [] : []}
              onValueChange={(value) => handleInputChange('subprocess', value)}
              placeholder={formData.process
                ? t('form.placeholders.subprocess_of', { process: formData.process })
                : t('form.placeholders.select_process_first')}
              createValueLabel={formData.process && formData.subprocess
                ? t('risks:form.labels.create_value', { value: formData.subprocess })
                : undefined}
            />
          )}
        </Field>
        <Field
          label={t('common:labels.category')}
          required
          error={categoryError}
          labelClassName="block text-[10px] font-black text-muted-foreground uppercase tracking-widest"
        >
          {(field) => (
            <CreatableCombobox
              {...field}
              value={formData.category || ''}
              suggestions={existingCategories}
              onValueChange={(value) => handleInputChange('category', value)}
              placeholder={t('form.placeholders.type_or_select')}
              createValueLabel={formData.category
                ? t('risks:form.labels.create_value', { value: formData.category })
                : undefined}
            />
          )}
        </Field>
      </div>
      <div>
        <label htmlFor="risk-description" className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
          {t('risks:form.labels.risk_description')} <span className="text-destructive">*</span>
        </label>
        <textarea
          id="risk-description"
          name="description"
          data-testid="risk-description-input"
          rows={3}
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          aria-invalid={fieldErrors.description ? 'true' : 'false'}
          className={`w-full bg-input/40 border rounded-xl px-4 py-3 text-foreground outline-none focus:border-accent/50 transition-all resize-none ${fieldErrors.description ? 'border-destructive' : 'border-input'
            }`}
          placeholder={t('form.placeholders.description')}
        />
        {fieldErrors.description && (
          <p className="text-destructive text-xs mt-1.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {fieldErrors.description}
          </p>
        )}
      </div>
    </div>
  );
}
