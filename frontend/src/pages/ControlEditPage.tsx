import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ControlForm } from '@/components/control-form/ControlFormContainer';
import { useTranslation } from '@/i18n/hooks';
import { controlApi } from '@/services/controlApi';
import { logError } from '@/services/logger';
import type { Control } from '@/types/control';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';

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
            } catch (error) {
                logError('Failed to fetch control for edit.', error);
            } finally {
                setIsLoading(false);
            }
        };
        void fetchControl();
    }, [id]);

    if (isLoading) {
        return <FormCapabilityGateState state="loading" />;
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
                {control.capabilities?.can_update === true ? (
                    <ControlForm
                        initialData={control}
                        isEdit={true}
                        allowRiskLinking={control.capabilities.can_link_risk === true}
                    />
                ) : (
                    <FormCapabilityGateState state="denied" />
                )}
            </motion.div>
        </div>
    );
}

export default ControlEditPage;
