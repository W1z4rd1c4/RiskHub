import { useEffect, useMemo, useState } from 'react';

import { getKriDraftValidationErrorKey } from '@/components/kri/kriFormValidation';
import type { KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ApiClientError } from '@/services/apiClient';
import { logError } from '@/services/logger';
import { userApi } from '@/services/userApi';
import { vendorApi } from '@/services/vendorApi';
import type { KRICreate, KRIUpdate } from '@/types/kri';

import type { KriModalFormData, KriOwnerOption, KRIModalProps } from './kriModalTypes';

const DEFAULT_FORM_DATA: KriModalFormData = {
    metric_name: '',
    description: '',
    current_value: 0,
    lower_limit: 0,
    upper_limit: 100,
    unit: '%',
    frequency: 'quarterly',
    reporting_owner_id: undefined,
};

function mergeVendorOptions(
    current: KRIVendorOption[],
    incoming: KRIVendorOption[],
): KRIVendorOption[] {
    const merged = new Map<number, KRIVendorOption>();
    for (const vendor of current) {
        merged.set(vendor.id, vendor);
    }
    for (const vendor of incoming) {
        merged.set(vendor.id, vendor);
    }
    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function formDataFromKri(kri: NonNullable<KRIModalProps['kri']>): KriModalFormData {
    return {
        metric_name: kri.metric_name,
        description: kri.description,
        current_value: kri.current_value,
        lower_limit: kri.lower_limit,
        upper_limit: kri.upper_limit,
        unit: kri.unit,
        frequency: kri.frequency || 'quarterly',
        reporting_owner_id: kri.reporting_owner_id ?? undefined,
    };
}

function errorMessageFromUnknown(err: unknown): string {
    if (err instanceof ApiClientError) {
        return err.rawMessage ?? err.messageKey;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return 'errorKeys.save_kri_failed';
}

export function useKriModalState({
    isOpen,
    kri,
    onClose,
    onDelete,
    onSave,
    risk_id,
}: KRIModalProps) {
    const isCreate = !kri;
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [vendorSearch, setVendorSearch] = useState('');
    const debouncedVendorSearch = useDebouncedValue(vendorSearch, 300);
    const [isLoadingVendors, setIsLoadingVendors] = useState(false);
    const [vendorOptions, setVendorOptions] = useState<KRIVendorOption[]>([]);
    const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
    const [selectedVendorOptions, setSelectedVendorOptions] = useState<KRIVendorOption[]>([]);
    const [formData, setFormData] = useState<KriModalFormData>(DEFAULT_FORM_DATA);
    const [users, setUsers] = useState<KriOwnerOption[]>([]);

    useEffect(() => {
        if (kri) {
            setFormData(formDataFromKri(kri));
            const linkedVendorOptions = (kri.linked_vendors ?? []).map((vendor) => ({
                id: vendor.id,
                name: vendor.name,
                status: vendor.status,
                is_archived: vendor.is_archived,
            }));
            setSelectedVendorIds(linkedVendorOptions.map((vendor) => vendor.id));
            setSelectedVendorOptions(linkedVendorOptions);
        } else {
            setFormData(DEFAULT_FORM_DATA);
            setSelectedVendorIds([]);
            setSelectedVendorOptions([]);
        }
        setVendorSearch('');
        setError(null);
    }, [kri, isOpen]);

    useEffect(() => {
        async function loadUsers() {
            try {
                const userList = await userApi.listVisibleUsers();
                setUsers(userList);
            } catch (err) {
                logError('Error loading users:', err);
            }
        }
        void loadUsers();
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        async function loadVendors() {
            try {
                setIsLoadingVendors(true);
                const response = await vendorApi.getVendors({
                    offset: 0,
                    limit: 25,
                    include_archived: true,
                    search: debouncedVendorSearch.trim() || undefined,
                });
                setVendorOptions(
                    response.items.map((vendor) => ({
                        id: vendor.id,
                        name: vendor.name,
                        status: vendor.status,
                        is_archived: vendor.is_archived,
                    })),
                );
            } catch (err) {
                logError('Error loading vendors for KRI modal:', err);
            } finally {
                setIsLoadingVendors(false);
            }
        }
        void loadVendors();
    }, [debouncedVendorSearch, isOpen]);

    useEffect(() => {
        if (vendorOptions.length === 0) {
            return;
        }
        setSelectedVendorOptions((current) => mergeVendorOptions(current, vendorOptions));
    }, [vendorOptions]);

    const validationErrorKey = useMemo(
        () => getKriDraftValidationErrorKey(formData),
        [formData],
    );

    function updateFormData(update: KriModalFormData) {
        setFormData((current) => ({ ...current, ...update }));
    }

    function clearError() {
        setError(null);
    }

    function handleSelectedVendorIdsChange(vendorIds: number[]) {
        setSelectedVendorIds(vendorIds);
        setSelectedVendorOptions((current) =>
            mergeVendorOptions(
                current.filter((vendor) => vendorIds.includes(vendor.id)),
                vendorOptions.filter((vendor) => vendorIds.includes(vendor.id)),
            ),
        );
        setError(null);
    }

    async function handleSave() {
        const validationError = getKriDraftValidationErrorKey(formData);
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            const { current_value: _currentValue, ...rest } = formData;
            const data = isCreate ? { ...formData, risk_id } as KRICreate : rest as KRIUpdate;
            await onSave(data, selectedVendorIds);
            onClose();
        } catch (err) {
            logError('Save failed:', err);
            setError(errorMessageFromUnknown(err));
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!kri || !onDelete) {
            return;
        }
        try {
            setIsDeleting(true);
            await onDelete(kri.id);
            onClose();
        } catch (err) {
            logError('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    }

    return {
        clearError,
        debouncedVendorSearch,
        error,
        formData,
        handleDelete,
        handleSave,
        handleSelectedVendorIdsChange,
        isCreate,
        isDeleteDialogOpen,
        isDeleting,
        isLoadingVendors,
        isSaving,
        selectedVendorIds,
        selectedVendorOptions,
        setIsDeleteDialogOpen,
        setVendorSearch,
        updateFormData,
        users,
        validationErrorKey,
        vendorOptions,
        vendorSearch,
    };
}
