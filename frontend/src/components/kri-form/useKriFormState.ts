import { useCallback, useReducer } from 'react';

import type { KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import type { KRICreate } from '@/types/kri';

import type { KRIFormVendorContext } from './kriForm.types';

interface KriFormState {
    approvalQueued: { message: string } | null;
    currentStep: number;
    error: string | null;
    formData: Partial<KRICreate>;
    isMismatchDialogOpen: boolean;
    isSubmitting: boolean;
    riskSearch: string;
    selectedCategory: string;
    selectedDeptId: string;
    selectedProcess: string;
    selectedVendorIds: number[];
    selectedVendorOptions: KRIVendorOption[];
    showOnlyVendorLinkedRisks: boolean;
    vendorSearch: string;
}

type KriFormAction =
    | { type: 'patch'; patch: Partial<Omit<KriFormState, 'formData'>> }
    | { type: 'setFormField'; field: keyof KRICreate; value: KRICreate[keyof KRICreate] | undefined };

const defaultFormData: Partial<KRICreate> = {
    risk_id: undefined,
    metric_name: '',
    description: '',
    current_value: 0,
    lower_limit: 0,
    upper_limit: 100,
    unit: '%',
    frequency: 'quarterly',
    reporting_owner_id: undefined,
};

function createInitialState(
    initialData: Partial<KRICreate> | undefined,
    initialLinkedVendorIds: number[],
    vendorContext: KRIFormVendorContext | null,
): KriFormState {
    return {
        approvalQueued: null,
        currentStep: 0,
        error: null,
        formData: {
            ...defaultFormData,
            ...initialData,
        },
        isMismatchDialogOpen: false,
        isSubmitting: false,
        riskSearch: '',
        selectedCategory: '',
        selectedDeptId: '',
        selectedProcess: '',
        selectedVendorIds: initialLinkedVendorIds,
        selectedVendorOptions: [],
        showOnlyVendorLinkedRisks: Boolean(vendorContext),
        vendorSearch: '',
    };
}

function kriFormReducer(state: KriFormState, action: KriFormAction): KriFormState {
    switch (action.type) {
        case 'patch':
            return {
                ...state,
                ...action.patch,
            };
        case 'setFormField':
            return {
                ...state,
                error: null,
                formData: {
                    ...state.formData,
                    [action.field]: action.value,
                },
            };
        default:
            return state;
    }
}

export function useKriFormState(args: {
    initialData?: Partial<KRICreate>;
    initialLinkedVendorIds: number[];
    vendorContext: KRIFormVendorContext | null;
}) {
    const [state, dispatch] = useReducer(
        kriFormReducer,
        createInitialState(args.initialData, args.initialLinkedVendorIds, args.vendorContext),
    );

    const setApprovalQueued = useCallback(
        (approvalQueued: { message: string } | null) => dispatch({ type: 'patch', patch: { approvalQueued } }),
        [],
    );
    const setCurrentStep = useCallback(
        (currentStep: number) => dispatch({ type: 'patch', patch: { currentStep } }),
        [],
    );
    const setError = useCallback((error: string | null) => dispatch({ type: 'patch', patch: { error } }), []);
    const setFormField = useCallback(
        <K extends keyof KRICreate>(field: K, value: KRICreate[K] | undefined) =>
            dispatch({ type: 'setFormField', field, value }),
        [],
    );
    const setIsMismatchDialogOpen = useCallback(
        (isMismatchDialogOpen: boolean) => dispatch({ type: 'patch', patch: { isMismatchDialogOpen } }),
        [],
    );
    const setIsSubmitting = useCallback(
        (isSubmitting: boolean) => dispatch({ type: 'patch', patch: { isSubmitting } }),
        [],
    );
    const setRiskSearch = useCallback(
        (riskSearch: string) => dispatch({ type: 'patch', patch: { riskSearch } }),
        [],
    );
    const setSelectedCategory = useCallback(
        (selectedCategory: string) => dispatch({ type: 'patch', patch: { selectedCategory } }),
        [],
    );
    const setSelectedDeptId = useCallback(
        (selectedDeptId: string) => dispatch({ type: 'patch', patch: { selectedDeptId } }),
        [],
    );
    const setSelectedProcess = useCallback(
        (selectedProcess: string) => dispatch({ type: 'patch', patch: { selectedProcess } }),
        [],
    );
    const setSelectedVendorIds = useCallback(
        (selectedVendorIds: number[]) => dispatch({ type: 'patch', patch: { selectedVendorIds } }),
        [],
    );
    const setSelectedVendorOptions = useCallback(
        (selectedVendorOptions: KRIVendorOption[]) =>
            dispatch({ type: 'patch', patch: { selectedVendorOptions } }),
        [],
    );
    const setShowOnlyVendorLinkedRisks = useCallback(
        (showOnlyVendorLinkedRisks: boolean) =>
            dispatch({ type: 'patch', patch: { showOnlyVendorLinkedRisks } }),
        [],
    );
    const setVendorSearch = useCallback(
        (vendorSearch: string) => dispatch({ type: 'patch', patch: { vendorSearch } }),
        [],
    );

    return {
        ...state,
        setApprovalQueued,
        setCurrentStep,
        setError,
        setFormField,
        setIsMismatchDialogOpen,
        setIsSubmitting,
        setRiskSearch,
        setSelectedCategory,
        setSelectedDeptId,
        setSelectedProcess,
        setSelectedVendorIds,
        setSelectedVendorOptions,
        setShowOnlyVendorLinkedRisks,
        setVendorSearch,
    };
}
