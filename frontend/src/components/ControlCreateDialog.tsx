import { useCallback, useId, useRef } from 'react';
import { ShieldPlus } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { DialogBody, DialogHeader, DialogShell } from './ui/dialog';
import { ControlForm } from './control-form/ControlFormContainer';
import type { ControlFormLocationState } from './control-form/useControlFormWorkflow';

interface ControlCreateDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (
        controlId: number,
        locationState?: ControlFormLocationState,
        acceptNavigation?: () => void,
    ) => void | Promise<void>;
}

export function ControlCreateDialog({ isOpen, onClose, onSuccess }: ControlCreateDialogProps) {
    const { t } = useTranslation(['controls', 'common']);
    const titleId = useId();
    const closeRequestRef = useRef<(() => void) | null>(null);
    const registerCloseRequest = useCallback((requestClose: (() => void) | null) => {
        closeRequestRef.current = requestClose;
    }, []);
    const requestClose = useCallback(() => {
        const registeredRequest = closeRequestRef.current;
        if (registeredRequest) {
            registeredRequest();
        } else {
            onClose();
        }
    }, [onClose]);

    return (
        <DialogShell isOpen={isOpen} onClose={requestClose} titleId={titleId} size="xl">
            <DialogHeader title={t('controls:create_control')} icon={ShieldPlus} />
            {/* The multi-step form owns its own Back/Next/Submit row. */}
            <DialogBody className="custom-scrollbar md:p-8">
                <ControlForm
                    onSuccess={onSuccess}
                    onCancel={onClose}
                    registerCloseRequest={registerCloseRequest}
                    surface="nested"
                />
            </DialogBody>
        </DialogShell>
    );
}
