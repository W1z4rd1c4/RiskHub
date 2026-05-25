import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApprovalQueuedBanner } from '@/components/forms/ApprovalQueuedBanner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';

import { KriFormErrorAlert } from './KriFormErrorAlert';
import { KriFormNavigation } from './KriFormNavigation';
import { KriFormStepContent } from './KriFormStepContent';
import { KriMismatchDialog } from './KriMismatchDialog';
import { KriVendorContextBanner } from './KriVendorContextBanner';
import { buildDepartmentOptions, filterRisksForSelection, getDisplayedRisks, getEffectiveVendorIds, getKnownRisks, getUniqueCategories, getUniqueProcesses, isRiskLinkedToVendor } from './kriForm.selectors';
import type { KRIFormProps } from './kriForm.types';
import { mergeVendorOptions, syncSelectedVendorOptions, validateKriDetails, validateRiskSelection } from './kriForm.utils';
import { useKriFormState } from './useKriFormState';
import { useKriLookups } from './useKriLookups';
import { useKriSubmit } from './useKriSubmit';

type KriFormTranslator = ReturnType<typeof useTranslation>['t'];

function KriApprovalQueuedFeedback({
    approvalQueued,
    onClose,
    t,
}: {
    approvalQueued: { message: string } | null;
    onClose: () => void;
    t: KriFormTranslator;
}) {
    if (!approvalQueued) {
        return null;
    }

    const message = approvalQueued.message.startsWith('errorKeys.')
        ? t(approvalQueued.message, { ns: 'errorKeys' })
        : approvalQueued.message;

    return (
        <ApprovalQueuedBanner
            closeLabel={t('common:actions.close')}
            message={message}
            onClose={onClose}
            title={t('approval_submitted', { ns: 'errorKeys' })}
            viewApprovalsLabel={`${t('common:actions.view')} ${t('approvals:title', { ns: 'approvals', defaultValue: 'Approvals' })}`}
        />
    );
}

export function KRIFormContainer({
    initialData,
    isEdit = false,
    kriId,
    onSuccess,
    onCancel,
    firstStepBackLabel,
    vendorContext = null,
    initialLinkedVendorIds = [],
}: KRIFormProps) {
    const { t } = useTranslation(['approvals', 'common', 'errorKeys', 'kris']);
    const navigate = useNavigate();
    const state = useKriFormState({ initialData, initialLinkedVendorIds, vendorContext });
    const debouncedRiskSearch = useDebouncedValue(state.riskSearch, 300);
    const debouncedVendorSearch = useDebouncedValue(state.vendorSearch, 300);
    const { selectedVendorOptions, setStatePatch } = state;

    const lookups = useKriLookups({
        debouncedRiskSearch,
        debouncedVendorSearch,
        isEdit,
        riskId: state.formData.risk_id,
        selectedCategory: state.selectedCategory,
        selectedDeptId: state.selectedDeptId,
        selectedProcess: state.selectedProcess,
        showOnlyVendorLinkedRisks: state.showOnlyVendorLinkedRisks,
        vendorContext,
    });

    useEffect(() => {
        if (lookups.vendorOptions.length === 0) {
            return;
        }
        const mergedVendorOptions = mergeVendorOptions(selectedVendorOptions, lookups.vendorOptions);
        const optionsChanged =
            mergedVendorOptions.length !== selectedVendorOptions.length
            || mergedVendorOptions.some((vendor, index) => vendor.id !== selectedVendorOptions[index]?.id);

        if (optionsChanged) {
            setStatePatch({ selectedVendorOptions: mergedVendorOptions });
        }
    }, [lookups.vendorOptions, selectedVendorOptions, setStatePatch]);

    const effectiveVendorIds = useMemo(
        () => getEffectiveVendorIds(state.selectedVendorIds, vendorContext),
        [state.selectedVendorIds, vendorContext],
    );
    const displayedRisks = useMemo(
        () => getDisplayedRisks({
            showOnlyVendorLinkedRisks: state.showOnlyVendorLinkedRisks,
            vendorContext,
            genericRisks: lookups.genericRisks,
            vendorLinkedRisks: lookups.vendorLinkedRisks,
        }),
        [lookups.genericRisks, lookups.vendorLinkedRisks, state.showOnlyVendorLinkedRisks, vendorContext],
    );
    const knownRisks = useMemo(
        () => getKnownRisks({
            displayedRisks,
            vendorLinkedRisks: lookups.vendorLinkedRisks,
            genericRisks: lookups.genericRisks,
            selectedRiskRecord: lookups.selectedRiskRecord,
        }),
        [displayedRisks, lookups.genericRisks, lookups.selectedRiskRecord, lookups.vendorLinkedRisks],
    );
    const uniqueDepartments = useMemo(() => buildDepartmentOptions(displayedRisks), [displayedRisks]);
    const uniqueProcesses = useMemo(() => getUniqueProcesses(displayedRisks), [displayedRisks]);
    const uniqueCategories = useMemo(() => getUniqueCategories(displayedRisks), [displayedRisks]);
    const filteredRisks = useMemo(
        () => filterRisksForSelection({
            displayedRisks,
            riskSearch: state.riskSearch,
            selectedDeptId: state.selectedDeptId,
            selectedProcess: state.selectedProcess,
            selectedCategory: state.selectedCategory,
            showOnlyVendorLinkedRisks: state.showOnlyVendorLinkedRisks,
            vendorContext,
            vendorLinkedRiskIds: lookups.vendorLinkedRiskIds,
        }),
        [
            displayedRisks,
            lookups.vendorLinkedRiskIds,
            state.riskSearch,
            state.selectedCategory,
            state.selectedDeptId,
            state.selectedProcess,
            state.showOnlyVendorLinkedRisks,
            vendorContext,
        ],
    );
    const selectedRisk = useMemo(
        () => knownRisks.find((risk) => risk.id === state.formData.risk_id),
        [knownRisks, state.formData.risk_id],
    );
    const isSelectedRiskLinkedToVendor = useMemo(
        () => isRiskLinkedToVendor(state.formData.risk_id, vendorContext, lookups.vendorLinkedRiskIds),
        [lookups.vendorLinkedRiskIds, state.formData.risk_id, vendorContext],
    );

    const visibleError = state.error ?? lookups.lookupErrorKey;
    const cancelLabel = firstStepBackLabel ?? t('common:actions.cancel');
    const isLoadingRisks =
        state.showOnlyVendorLinkedRisks && vendorContext
            ? lookups.isLoadingVendorLinkedRisks
            : lookups.isLoadingGenericRisks;

    const setFormError = (error: string | null) => setStatePatch({ error });
    const validateStep1 = () => validateRiskSelection(state.formData.risk_id, setFormError, t);
    const validateStep2 = () => validateKriDetails(state.formData, setFormError, t);
    const handleSelectedVendorIdsChange = (vendorIds: number[]) => {
        setStatePatch({
            error: null,
            selectedVendorIds: vendorIds,
            selectedVendorOptions: syncSelectedVendorOptions(vendorIds, selectedVendorOptions, lookups.vendorOptions),
        });
    };

    const { finalizeCreate, handleSubmit } = useKriSubmit({
        effectiveVendorIds,
        formData: state.formData,
        isEdit,
        isSelectedRiskLinkedToVendor,
        kriId,
        navigate,
        onSuccess,
        setStatePatch,
        t,
        validateStep1,
        validateStep2,
        vendorContext,
    });

    return (
        <>
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-8">
                <div className="glass-card flex min-h-[560px] flex-col">
                    <KriApprovalQueuedFeedback
                        approvalQueued={state.approvalQueued}
                        onClose={() => setStatePatch({ approvalQueued: null })}
                        t={t}
                    />
                    {visibleError ? <KriFormErrorAlert error={visibleError} /> : null}
                    {vendorContext ? (
                        <KriVendorContextBanner vendorName={vendorContext.vendorName} />
                    ) : null}

                    <div className="flex-1 space-y-8">
                        <KriFormStepContent
                            currentStep={state.currentStep}
                            filteredRisks={filteredRisks}
                            formData={state.formData}
                            isLoadingRisks={isLoadingRisks}
                            isLoadingVendors={lookups.isLoadingVendors}
                            isSelectedRiskLinkedToVendor={isSelectedRiskLinkedToVendor}
                            onClearSelectedRisk={() => state.setFormField('risk_id', undefined)}
                            onInputChange={state.setFormField}
                            onRiskSearchChange={(riskSearch) => setStatePatch({ riskSearch })}
                            onRiskSelect={(riskId) => state.setFormField('risk_id', riskId)}
                            onSelectedCategoryChange={(selectedCategory) => setStatePatch({ selectedCategory })}
                            onSelectedDeptIdChange={(selectedDeptId) => setStatePatch({ selectedDeptId })}
                            onSelectedProcessChange={(selectedProcess) => setStatePatch({ selectedProcess })}
                            onSelectedVendorIdsChange={handleSelectedVendorIdsChange}
                            onShowOnlyVendorLinkedRisksChange={(showOnlyVendorLinkedRisks) =>
                                setStatePatch({ showOnlyVendorLinkedRisks })
                            }
                            onVendorSearchChange={(vendorSearch) => setStatePatch({ vendorSearch })}
                            riskSearch={state.riskSearch}
                            selectedCategory={state.selectedCategory}
                            selectedDeptId={state.selectedDeptId}
                            selectedProcess={state.selectedProcess}
                            selectedRisk={selectedRisk}
                            selectedVendorIds={state.selectedVendorIds}
                            selectedVendorOptions={selectedVendorOptions}
                            showOnlyVendorLinkedRisks={state.showOnlyVendorLinkedRisks}
                            uniqueCategories={uniqueCategories}
                            uniqueDepartments={uniqueDepartments}
                            uniqueProcesses={uniqueProcesses}
                            users={lookups.users}
                            vendorContext={vendorContext}
                            vendorOptions={lookups.vendorOptions}
                            vendorSearch={state.vendorSearch}
                        />
                    </div>

                    <KriFormNavigation
                        cancelLabel={cancelLabel}
                        currentStep={state.currentStep}
                        isEdit={isEdit}
                        isSubmitting={state.isSubmitting}
                        navigate={navigate}
                        onCancel={onCancel}
                        setStatePatch={setStatePatch}
                        validateStep1={validateStep1}
                    />
                </div>
            </form>

            {state.isMismatchDialogOpen ? (
                <KriMismatchDialog
                    isSubmitting={state.isSubmitting}
                    onCancel={() => setStatePatch({ isMismatchDialogOpen: false })}
                    onContinueWithoutLinking={() => void finalizeCreate({ linkRiskFirst: false })}
                    onLinkRiskAndContinue={() => void finalizeCreate({ linkRiskFirst: true })}
                />
            ) : null}
        </>
    );
}
