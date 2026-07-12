import { useId } from 'react';
import { X } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { DirectoryImportResponse } from '@/types/directory';
import { DirectoryUserImportPanel } from '@/components/users/DirectoryUserImportPanel';
import { DialogShell } from '@/components/DialogShell';

interface ADUserPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onImported: (result: DirectoryImportResponse) => void;
}

export function ADUserPicker({ isOpen, onClose, onImported }: ADUserPickerProps) {
    const { t } = useTranslation('admin');
    const titleId = useId();

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            backdropClassName="absolute inset-0 bg-black/60"
            contentClassName="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
        >
            <div className="mb-4 flex items-center justify-between">
                <h3 id={titleId} className="text-lg font-semibold text-white">
                    {t('users.add_from_ad')}
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                    aria-label={t('common:actions.close')}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            <DirectoryUserImportPanel onImported={onImported} />
        </DialogShell>
    );
}
