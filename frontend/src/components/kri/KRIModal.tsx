import { useId } from 'react';
import { Activity, Calendar, Save } from 'lucide-react';

import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue } from '@/i18n/formatters';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';

import { KriCadenceOwnerFields } from './KriCadenceOwnerFields';
import { KriMetricFields } from './KriMetricFields';
import { KriThresholdFields } from './KriThresholdFields';
import { KriVendorSection } from './KriVendorSection';
import type { KRIModalProps, KRIModalSaveResult } from './kriModalTypes';
import { createKriModalSnapshot, useKriModalState } from './useKriModalState';

export type { KRIModalSaveResult };

export function KRIModal(props: KRIModalProps) {
    const { i18n, t } = useTranslation(['kris', 'common', 'errorKeys']);
    const { isOpen, kri, onClose } = props;
    const state = useKriModalState(props);
    const currentSnapshot = createKriModalSnapshot(
        state.formData,
        state.selectedVendorIds,
    );
    const isBusy = state.isSaving;
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({
        busy: isBusy,
        currentSnapshot,
        enabled: isOpen,
    });
    const titleId = useId();

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            isBusy={isBusy}
            dirtyGuard={{ requestLocalLeave, confirmationDialog }}
            titleId={titleId}
            size="lg"
            className="max-w-xl"
        >
            <DialogHeader
                title={t('edit_kri', { ns: 'kris' })}
                description={t('modal.framework', { ns: 'kris' })}
                icon={Activity}
                closeLabel={t('actions.close', { ns: 'common' })}
            />

            <DialogBody className="p-0">
                <fieldset disabled={isBusy} className="min-w-0 p-8 space-y-6">
                    {state.error ? (
                        <InlineMessage tone="danger">
                            {state.error.startsWith('errorKeys.') || state.error.startsWith('kris:')
                                ? t(state.error, { ns: state.error.startsWith('kris:') ? 'kris' : 'errorKeys' })
                                : state.error}
                        </InlineMessage>
                    ) : null}

                    <KriMetricFields
                        clearError={state.clearError}
                        formData={state.formData}
                        t={t}
                        updateFormData={state.updateFormData}
                    />

                    <KriThresholdFields
                        formData={state.formData}
                        t={t}
                        updateFormData={state.updateFormData}
                    />

                    <KriCadenceOwnerFields
                        formData={state.formData}
                        t={t}
                        updateFormData={state.updateFormData}
                        users={state.users}
                    />

                    <KriVendorSection
                        debouncedVendorSearch={state.debouncedVendorSearch}
                        isLoadingVendors={state.isLoadingVendors}
                        onChange={state.handleSelectedVendorIdsChange}
                        onSearchChange={state.setVendorSearch}
                        selectedVendorIds={state.selectedVendorIds}
                        selectedVendorOptions={state.selectedVendorOptions}
                        t={t}
                        vendorOptions={state.vendorOptions}
                        vendorSearch={state.vendorSearch}
                    />

                    <div className="flex items-center gap-2 px-4 py-3 bg-tint/[0.03] border border-border rounded-xl text-xs text-muted-foreground font-bold">
                        <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('modal.last_updated', { ns: 'kris' })}:{' '}
                        {formatDateTimeValue(kri.last_updated, i18n.language)}
                    </div>
                </fieldset>
            </DialogBody>

            <DialogFooter
                cancelLabel={t('actions.cancel', { ns: 'common' })}
                submitLabel={state.isSaving ? t('loading.generic', { ns: 'common' }) : t('actions.save', { ns: 'common' })}
                submitIcon={<Save aria-hidden="true" />}
                submitDisabled={state.validationErrorKey !== null}
                onSubmit={() => void state.handleSave(
                    () => acceptCurrentSnapshot(currentSnapshot),
                )}
            />
        </DialogShell>
    );
}
