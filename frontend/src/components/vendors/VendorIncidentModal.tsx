import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertOctagon, Loader2, Save, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { vendorIncidentApi } from '@/services/vendorIncidentApi';
import type { VendorIncidentSeverity, VendorIncidentType } from '@/types/vendorIncident';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { VendorActionButton, VendorInlineMessage } from '@/components/vendors/vendorRouteUi';

interface VendorIncidentModalProps {
    vendorId: number;
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => Promise<void>;
}

export function VendorIncidentModal({ vendorId, isOpen, onClose, onSaved }: VendorIncidentModalProps) {
    const { t } = useTranslation('vendors');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [incidentType, setIncidentType] = useState<VendorIncidentType>('security');
    const [severity, setSeverity] = useState<VendorIncidentSeverity>('medium');
    const [isMajor, setIsMajor] = useState(false);
    const [summary, setSummary] = useState('');
    const [details, setDetails] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setIncidentType('security');
        setSeverity('medium');
        setIsMajor(false);
        setSummary('');
        setDetails('');
        setError(null);
    }, [isOpen]);

    const typeOptions = useMemo(
        () => [
            { value: 'security', label: t('incidents.type.security') },
            { value: 'operational', label: t('incidents.type.operational') },
            { value: 'regulatory_breach', label: t('incidents.type.regulatory_breach') },
            { value: 'contract_breach', label: t('incidents.type.contract_breach') },
            { value: 'other', label: t('incidents.type.other') },
        ],
        [t],
    );

    const severityOptions = useMemo(
        () => [
            { value: 'low', label: t('incidents.severity.low') },
            { value: 'medium', label: t('incidents.severity.medium') },
            { value: 'high', label: t('incidents.severity.high') },
            { value: 'critical', label: t('incidents.severity.critical') },
        ],
        [t],
    );

    const save = async () => {
        if (!summary.trim()) return;
        try {
            setIsSaving(true);
            setError(null);
            await vendorIncidentApi.createIncident(vendorId, {
                incident_type: incidentType,
                severity,
                is_major: isMajor,
                summary: summary.trim(),
                details: details.trim() || null,
                occurred_at: new Date().toISOString(),
            });
            await onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to create incident:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen ? (
                <div className="vendor-route fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="vendor-modal-backdrop absolute inset-0"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 18 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 18 }}
                        className="vendor-modal relative z-10 w-full max-w-2xl"
                    >
                        <div className="vendor-modal__header vendor-divider flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="vendor-badge vendor-badge--danger">
                                    <AlertOctagon className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="vendor-title text-xl font-bold">{t('incidents.actions.add')}</h3>
                                </div>
                            </div>
                            <VendorActionButton onClick={onClose} variant="ghost" aria-label={t('actions.cancel')}>
                                <X className="h-4 w-4" />
                            </VendorActionButton>
                        </div>

                        <div className="vendor-modal__body space-y-6">
                            {error ? <VendorInlineMessage tone="danger">{error}</VendorInlineMessage> : null}

                            <div className="vendor-form-grid">
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('columns.type')}</label>
                                    <ThemedSelect value={incidentType} onValueChange={(v) => setIncidentType(v as VendorIncidentType)} options={typeOptions} />
                                </div>
                                <div className="vendor-field">
                                    <label className="vendor-label">{t('columns.severity')}</label>
                                    <ThemedSelect value={severity} onValueChange={(v) => setSeverity(v as VendorIncidentSeverity)} options={severityOptions} />
                                </div>
                                <div className="vendor-field md:col-span-2">
                                    <label className="vendor-checkbox">
                                        <input type="checkbox" checked={isMajor} onChange={(e) => setIsMajor(e.target.checked)} />
                                        <span>{t('incidents.fields.is_major')}</span>
                                    </label>
                                </div>
                                <div className="vendor-field md:col-span-2">
                                    <label className="vendor-label">{t('incidents.fields.summary')}</label>
                                    <input
                                        value={summary}
                                        onChange={(e) => setSummary(e.target.value)}
                                        className="vendor-input"
                                        placeholder={t('incidents.fields.summary')}
                                    />
                                </div>
                                <div className="vendor-field md:col-span-2">
                                    <label className="vendor-label">{t('incidents.fields.details')}</label>
                                    <textarea
                                        value={details}
                                        onChange={(e) => setDetails(e.target.value)}
                                        rows={3}
                                        className="vendor-textarea"
                                        placeholder={t('incidents.fields.details')}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="vendor-modal__footer vendor-divider flex items-center justify-end gap-3">
                            <VendorActionButton onClick={onClose}>{t('actions.cancel')}</VendorActionButton>
                            <VendorActionButton
                                onClick={save}
                                disabled={isSaving || !summary.trim()}
                                variant="primary"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {t('actions.save')}
                            </VendorActionButton>
                        </div>
                    </motion.div>
                </div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
