import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ControlForm } from '@/components/ControlForm';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { vendorLinkApi } from '@/services/vendorLinkApi';

import {
    coerceVendorContext,
    type VendorDetailFlash,
} from './vendors/vendorDetailPresentation';

export function ControlNewPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation(['controls', 'common', 'vendors']);
    const { vendorId, returnTo } = coerceVendorContext(
        searchParams.get('vendor_id'),
        searchParams.get('return_to'),
    );
    const isVendorContext = vendorId !== null && returnTo !== null;

    const navigateToVendor = (flash: VendorDetailFlash) => {
        if (!returnTo) {
            void navigate('/controls');
            return;
        }
        void navigate(returnTo, {
            state: {
                vendorFlash: flash,
            },
        });
    };

    const handleVendorContextSuccess = async (controlId: number) => {
        if (!vendorId || !returnTo) {
            void navigate(`/controls/${controlId}`);
            return;
        }

        try {
            await vendorLinkApi.linkControl(vendorId, controlId);
            navigateToVendor({
                tone: 'success',
                message: t('vendors:links.controls.created_and_linked'),
                ctaHref: `/controls/${controlId}`,
                ctaLabel: t('vendors:links.actions.open_control'),
            });
        } catch (error) {
            logError('Control created but failed to link vendor context.', error);
            navigateToVendor({
                tone: 'warn',
                message: t('vendors:links.controls.created_but_not_linked'),
                ctaHref: `/controls/${controlId}`,
                ctaLabel: t('vendors:links.actions.open_control'),
            });
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate(isVendorContext ? returnTo! : '/controls')}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-2"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {isVendorContext ? t('vendors:links.actions.back_to_vendor') : `${t('common:actions.back')} ${t('controls:title')}`}
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">{t('controls:new_control')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('controls:page_subtitle')}</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <ControlForm
                    onSuccess={isVendorContext ? handleVendorContextSuccess : undefined}
                    onCancel={isVendorContext ? () => navigate(returnTo!) : undefined}
                    firstStepBackLabel={isVendorContext ? t('vendors:links.actions.back_to_vendor') : undefined}
                />
            </motion.div>
        </div>
    );
}

export default ControlNewPage;
