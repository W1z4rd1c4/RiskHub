import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { ControlForm } from '@/components/ControlForm';
import { controlApi } from '@/services/controlApi';
import type { Control } from '@/types/control';
import { useAuth } from '@/contexts/AuthContext';

export function ControlNewPage() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <button
                    onClick={() => navigate('/controls')}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-accent transition-colors uppercase tracking-widest mb-2"
                >
                    <ArrowLeft className="h-3 w-3" /> Back to Catalog
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">Define New Control</h2>
                <p className="text-slate-500 font-medium tracking-tight">Standardize a new risk control measure across the organization.</p>
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
    const { mockUserId } = useAuth();
    const [control, setControl] = useState<Control | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchControl = async () => {
            if (!id) return;
            try {
                setIsLoading(true);
                const data = await controlApi.getControl(parseInt(id), mockUserId);
                setControl(data);
            } catch (err) {
                console.error('Error fetching control for edit:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchControl();
    }, [id, mockUserId]);

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
                    <ArrowLeft className="h-3 w-3" /> Back to Detail
                </button>
                <h2 className="text-3xl font-black text-white tracking-tighter">Edit Control</h2>
                <p className="text-slate-500 font-medium tracking-tight">Updating configuration for #CTL-{String(control.id).padStart(4, '0')}</p>
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
