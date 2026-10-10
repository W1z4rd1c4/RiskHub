import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { CreatableCombobox } from '@/components/ui/CreatableCombobox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  // PG-04: validation errors are i18n keys (`risks:form.errors.*`), shown per field.
  const errorText = (field: string) => (fieldErrors[field] ? t(fieldErrors[field], fieldErrors[field]) : undefined);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <Field label={t('risks:fields.name')} required error={errorText('name')}>
        {(field) => (
          <Input
            {...field}
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder={t('form.placeholders.name')}
            data-testid="risk-name-input"
          />
        )}
      </Field>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label={t('risks:form.labels.risk_type')}>
          {(field) => (
            <ThemedSelect
              {...field}
              value={selectedRiskType}
              onValueChange={(v) => handleInputChange('risk_type', v)}
              disabled={riskTypesLoading}
              className="w-full"
              options={riskTypes.map((rt) => ({ value: rt.code, label: rt.display_name }))}
            />
          )}
        </Field>
        <Field
          label={t('risks:form.labels.main_process')}
          required
          error={errorText('process')}
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
        <Field label={t('risks:form.labels.subprocess_optional')}>
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
          error={errorText('category')}
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
      <Field id="risk-description" label={t('risks:form.labels.risk_description')} required error={errorText('description')}>
        {(field) => (
          <Textarea
            {...field}
            name="description"
            data-testid="risk-description-input"
            rows={3}
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder={t('form.placeholders.description')}
          />
        )}
      </Field>
    </div>
  );
}
