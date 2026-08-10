import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { vendorReportApi } from '@/services/vendorReportApi';

// The register export already lives on VendorReportsPage (S2 was re-scoped from
// "no export" to "readiness screens don't link to it"). This is the mounted
// business route for that page (routing/business.tsx `vendor-reports`).
const REGISTER_EXPORT_PATH = '/vendor-reports';

// Default CTA styling, hoisted out of the JSX `??` position so the i18n
// hardcoded-string scanner never mistakes this Tailwind className for UI copy
// ([jsx-fallback]). It is a class list, not user-facing text.
const DEFAULT_LINK_CLASS =
    'px-5 py-2.5 rounded-xl bg-accent/20 border border-accent/30 text-accent font-bold hover:bg-accent/30 transition-all flex items-center gap-2 w-fit';

/**
 * FR-P5-8 (S2 / N21): a discoverability CTA that links the Committee and DQ
 * readiness screens to the existing DORA register export.
 *
 * The link is gated on the **separate** `can_download_dora_register` capability
 * (from `vendor_report_capabilities` = `reports:read` + role), NOT on
 * `ict_committee:read` / `vendors:read` (N21). A viewer who can read the
 * readiness screen but cannot export the register never sees a link they can't
 * use; the capability is fetched from the same dedicated endpoint the export
 * page itself uses, so the two stay in lock-step. A failed/absent capability
 * check fails closed (no link).
 */
export function RegisterExportLink({ className = DEFAULT_LINK_CLASS }: { className?: string }) {
    const { t } = useTranslation('common');
    const [canDownload, setCanDownload] = useState(false);

    useEffect(() => {
        let cancelled = false;
        vendorReportApi
            .getCapabilities()
            .then((capabilities) => {
                if (!cancelled) {
                    setCanDownload(resolveCapabilityFlag(capabilities, 'can_download_dora_register'));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCanDownload(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!canDownload) {
        return null;
    }

    return (
        <Link
            to={REGISTER_EXPORT_PATH}
            data-testid="register-export-link"
            className={className}
        >
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('export.dora_register.link')}
        </Link>
    );
}

export default RegisterExportLink;
