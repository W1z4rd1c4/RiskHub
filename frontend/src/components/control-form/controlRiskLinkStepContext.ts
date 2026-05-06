import { createFormStepContext } from '@/components/forms/FormStepContext';
import type { ControlEffectiveness, RiskSummary } from '@/types/risk';

export interface ControlRiskLinkStepContextValue {
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

const controlRiskLinkStepContext = createFormStepContext<ControlRiskLinkStepContextValue>('ControlRiskLinkStep');

export const ControlRiskLinkStepProvider = controlRiskLinkStepContext.Provider;
export const useControlRiskLinkStep = controlRiskLinkStepContext.useValue;
