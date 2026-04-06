import type { KRICreate } from "@/types/kri";
import type { RiskSummary } from "@/types/risk";

import { KriDetailsStep } from "./KriDetailsStep";
import { KriRiskSelectionStep } from "./KriRiskSelectionStep";
import type {
  KRIFormVendorContext,
  KriVisibleUser,
} from "./kriForm.types";
import type { KRIVendorOption } from "@/components/kri/KRIVendorSelector";

interface KriFormStepContentProps {
  currentStep: number;
  filteredRisks: RiskSummary[];
  formData: Partial<KRICreate>;
  isLoadingRisks: boolean;
  isLoadingVendors: boolean;
  isSelectedRiskLinkedToVendor: boolean;
  onClearSelectedRisk: () => void;
  onInputChange: (
    field: keyof KRICreate,
    value: KRICreate[keyof KRICreate] | undefined,
  ) => void;
  onRiskSearchChange: (value: string) => void;
  onRiskSelect: (riskId: number) => void;
  onSelectedCategoryChange: (value: string) => void;
  onSelectedDeptIdChange: (value: string) => void;
  onSelectedProcessChange: (value: string) => void;
  onSelectedVendorIdsChange: (vendorIds: number[]) => void;
  onShowOnlyVendorLinkedRisksChange: (value: boolean) => void;
  onVendorSearchChange: (value: string) => void;
  riskSearch: string;
  selectedCategory: string;
  selectedDeptId: string;
  selectedProcess: string;
  selectedRisk: RiskSummary | undefined;
  selectedVendorIds: number[];
  selectedVendorOptions: KRIVendorOption[];
  showOnlyVendorLinkedRisks: boolean;
  uniqueCategories: string[];
  uniqueDepartments: Array<{ value: string; label: string }>;
  uniqueProcesses: string[];
  users: KriVisibleUser[];
  vendorContext: KRIFormVendorContext | null;
  vendorOptions: KRIVendorOption[];
  vendorSearch: string;
}

export function KriFormStepContent({
  currentStep,
  filteredRisks,
  formData,
  isLoadingRisks,
  isLoadingVendors,
  isSelectedRiskLinkedToVendor,
  onClearSelectedRisk,
  onInputChange,
  onRiskSearchChange,
  onRiskSelect,
  onSelectedCategoryChange,
  onSelectedDeptIdChange,
  onSelectedProcessChange,
  onSelectedVendorIdsChange,
  onShowOnlyVendorLinkedRisksChange,
  onVendorSearchChange,
  riskSearch,
  selectedCategory,
  selectedDeptId,
  selectedProcess,
  selectedRisk,
  selectedVendorIds,
  selectedVendorOptions,
  showOnlyVendorLinkedRisks,
  uniqueCategories,
  uniqueDepartments,
  uniqueProcesses,
  users,
  vendorContext,
  vendorOptions,
  vendorSearch,
}: KriFormStepContentProps) {
  if (currentStep === 0) {
    return (
      <KriRiskSelectionStep
        filteredRisks={filteredRisks}
        isLoadingRisks={isLoadingRisks}
        isSelectedRiskLinkedToVendor={isSelectedRiskLinkedToVendor}
        onClearSelectedRisk={onClearSelectedRisk}
        onRiskSearchChange={onRiskSearchChange}
        onRiskSelect={onRiskSelect}
        onSelectedCategoryChange={onSelectedCategoryChange}
        onSelectedDeptIdChange={onSelectedDeptIdChange}
        onSelectedProcessChange={onSelectedProcessChange}
        onShowOnlyVendorLinkedRisksChange={onShowOnlyVendorLinkedRisksChange}
        riskSearch={riskSearch}
        selectedCategory={selectedCategory}
        selectedDeptId={selectedDeptId}
        selectedProcess={selectedProcess}
        selectedRisk={selectedRisk}
        showOnlyVendorLinkedRisks={showOnlyVendorLinkedRisks}
        uniqueCategories={uniqueCategories}
        uniqueDepartments={uniqueDepartments}
        uniqueProcesses={uniqueProcesses}
        vendorContext={vendorContext}
      />
    );
  }

  return (
    <KriDetailsStep
      formData={formData}
      isLoadingVendors={isLoadingVendors}
      onInputChange={onInputChange}
      onSelectedVendorIdsChange={onSelectedVendorIdsChange}
      onVendorSearchChange={onVendorSearchChange}
      selectedVendorIds={selectedVendorIds}
      selectedVendorOptions={selectedVendorOptions}
      users={users}
      vendorContext={vendorContext}
      vendorOptions={vendorOptions}
      vendorSearch={vendorSearch}
    />
  );
}
