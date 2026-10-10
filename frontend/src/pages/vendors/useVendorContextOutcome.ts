import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFeedback } from '@/hooks/useFeedback';

import type { VendorDetailFlash } from './vendorDetailPresentation';

/**
 * Outcome of a vendor-context create (risk / control / KRI created from a
 * Vendor page and linked back). D9 / FB-01: reported as a toast raised before
 * returning to the vendor, replacing the `vendorFlash` router-state banner.
 * The optional follow-up link becomes the toast action.
 */
export function useVendorContextOutcome() {
    const feedback = useFeedback();
    const navigate = useNavigate();

    return useCallback((outcome: VendorDetailFlash) => {
        const { ctaHref, ctaLabel } = outcome;
        const options = {
            title: outcome.message,
            action: ctaHref && ctaLabel
                ? { label: ctaLabel, onClick: () => { void navigate(ctaHref); } }
                : undefined,
        };
        if (outcome.tone === 'success') feedback.success(options);
        else if (outcome.tone === 'warn') feedback.warning(options);
        else feedback.error(options);
    }, [feedback, navigate]);
}
