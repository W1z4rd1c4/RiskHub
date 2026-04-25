import { useEffect, useState } from 'react';

import type { UserLookupItem } from '@/services/lookupApi';
import type { Vendor } from '@/types/vendor';

import {
    getOwnerAutoDepartmentId,
} from './vendorForm.mappers';
import {
    createInitialVendorFormData,
    type VendorFormField,
    type VendorFormData,
} from './vendorForm.types';

interface UseVendorFormStateOptions {
    initialData?: Vendor;
    users: UserLookupItem[];
}

export function useVendorFormState({ initialData, users }: UseVendorFormStateOptions) {
    const [formData, setFormData] = useState<VendorFormData>(() => createInitialVendorFormData(initialData));

    useEffect(() => {
        setFormData(createInitialVendorFormData(initialData));
    }, [initialData]);

    const handleChange = (field: VendorFormField, value: unknown) => {
        setFormData((previous) => {
            const next = { ...previous, [field]: value };

            if (field === 'outsourcing_owner_user_id') {
                next.department_id = getOwnerAutoDepartmentId(users, value, next.department_id) ?? null;
            }

            return next;
        });
    };

    return {
        formData,
        handleChange,
        setFormData,
    };
}
