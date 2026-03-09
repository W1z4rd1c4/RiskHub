import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ControlForm } from '@/components/ControlForm';
import { controlApi } from '@/services/controlApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { Control } from '@/types/control';
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
            navigate('/controls');
            return;
        }
        navigate(returnTo, {
            state: {
                vendorFlash: flash,
            },
        });
    };

    const handleVendorContextSuccess = async (controlId: number) => {
        if (!vendorId || !returnTo) {
            navigate(`/controls/${controlId}`);
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
            console.error('Control created but failed to link vendor context:', error);
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

export function ControlEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation(['controls', 'common']);
    const [control, setControl] = useState<Control | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchControl = async () => {
            if (!id) return;
            try {
                setIsLoading(true);
                const data = await controlApi.getControl(parseInt(id));
                setControl(data);
            } catch (err) {
                console.error('Error fetching control for edit:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchControl();
    }, [id]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[400px]">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!control) return null;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate(`/controls/${id}`)}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-2"
                >
                    <ArrowLeft className="h-3 w-3" /> {t('common:actions.back')} {t('common:labels.details')}
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">{t('controls:edit_control')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('controls:view_control')}: {control.name}</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <ControlForm initialData={control} isEdit={true} />
            </motion.div>
        </div>
    );
}
