import { useId } from 'react';

import { useTranslation } from '@/i18n/hooks';
import type { DirectoryImportResponse } from '@/types/directory';
import { DirectoryUserImportPanel } from '@/components/users/DirectoryUserImportPanel';
import { DialogBody, DialogHeader, DialogShell } from '@/components/ui/dialog';

interface ADUserPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onImported: (result: DirectoryImportResponse) => void;
}

export function ADUserPicker({ isOpen, onClose, onImported }: ADUserPickerProps) {
    const { t } = useTranslation('admin');
    const titleId = useId();

    return (
        <DialogShell isOpen={isOpen} onClose={onClose} titleId={titleId} size="lg">
            <DialogHeader title={t('users.add_from_ad')} />
            <DialogBody>
                <DirectoryUserImportPanel onImported={onImported} />
            </DialogBody>
        </DialogShell>
    );
}
