import { useEffect, useState } from 'react';

import { logError } from '@/services/logger';
import { vendorReportApi } from '@/services/vendorReportApi';
import type { VendorReportCapabilities } from '@/types/vendorReport';

export type VendorReportCapabilityState = 'pending' | 'ready' | 'unavailable';

export function useVendorReportCapabilities() {
    const [capabilities, setCapabilities] = useState<VendorReportCapabilities | null>(null);
    const [state, setState] = useState<VendorReportCapabilityState>('pending');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setState('pending');
        vendorReportApi.getCapabilities()
            .then((data) => {
                if (cancelled) return;
                setCapabilities(data);
                setState('ready');
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setCapabilities(null);
                setState('unavailable');
                logError('Failed to load vendor report capabilities.', error);
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    return {
        capabilities,
        retry: () => setAttempt((current) => current + 1),
        state,
    };
}
