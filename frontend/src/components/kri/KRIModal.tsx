import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Calendar } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';
import { formatDateTimeValue } from '@/i18n/formatters';

import { KriCadenceOwnerFields } from './KriCadenceOwnerFields';
import { KriMetricFields } from './KriMetricFields';
import { KriModalFooter } from './KriModalFooter';
import { KriModalHeader } from './KriModalHeader';
import { KriThresholdFields } from './KriThresholdFields';
import { KriVendorSection } from './KriVendorSection';
import type { KRIModalProps, KRIModalSaveResult } from './kriModalTypes';
import { useKriModalState } from './useKriModalState';

export type { KRIModalSaveResult };

export function KRIModal(props: KRIModalProps) {
    const { i18n, t } = useTranslation(['kris', 'common', 'errorKeys']);
    const { isOpen, kri, onClose, onDelete } = props;
    const state = useKriModalState(props);

    if (!isOpen) {
        return null;
    }

    if (typeof document === 'undefined') {
        return null;
    }

    const mainModal = createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-xl glass-card !p-0 overflow-hidden shadow-2xl"
                    >
                        <KriModalHeader isCreate={state.isCreate} onClose={onClose} t={t} />

                        <div className="p-8 space-y-6">
                            {state.error ? (
                                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-start gap-3">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        {state.error.startsWith('errorKeys.') || state.error.startsWith('kris:')
                                            ? t(state.error, { ns: state.error.startsWith('kris:') ? 'kris' : 'errorKeys' })
                                            : state.error}
                                    </span>
                                </div>
                            ) : null}

                            <KriMetricFields
                                clearError={state.clearError}
                                formData={state.formData}
                                isCreate={state.isCreate}
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

                            {!state.isCreate && kri ? (
                                <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] text-slate-500 font-bold">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {t('modal.last_updated', { ns: 'kris' })}:{' '}
                                    {formatDateTimeValue(kri.last_updated, i18n.language)}
                                </div>
                            ) : null}
                        </div>

                        <KriModalFooter
                            isCreate={state.isCreate}
                            isDeleting={state.isDeleting}
                            isSaving={state.isSaving}
                            onClose={onClose}
                            onDeleteClick={() => state.setIsDeleteDialogOpen(true)}
                            onSave={state.handleSave}
                            showDelete={!state.isCreate && Boolean(kri && onDelete)}
                            t={t}
                            validationErrorKey={state.validationErrorKey}
                        />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body,
    );

    return (
        <>
            {mainModal}
            <ConfirmDialog
                isOpen={state.isDeleteDialogOpen}
                onClose={() => state.setIsDeleteDialogOpen(false)}
                onConfirm={state.handleDelete}
                title={t('delete_kri', { ns: 'kris' })}
                message={t('modal.delete_confirm', { ns: 'kris', name: kri?.metric_name || '' })}
                confirmLabel={t('actions.delete', { ns: 'common' })}
                variant="danger"
                isLoading={state.isDeleting}
            />
        </>
    );
}
