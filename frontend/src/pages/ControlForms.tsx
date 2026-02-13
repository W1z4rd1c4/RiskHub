import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ControlForm } from '@/components/ControlForm';
import { controlApi } from '@/services/controlApi';
import type { Control } from '@/types/control';
export function ControlNewPage() {
    const navigate = useNavigate();
    const { t } = useTranslation(['controls', 'common']);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate('/controls')}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-2"
                >
                    <ArrowLeft className="h-3 w-3" /> {t('common:actions.back')} {t('controls:title')}
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">{t('controls:new_control')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('controls:page_subtitle')}</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <ControlForm />
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
