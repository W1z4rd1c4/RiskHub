import * as React from 'react';
import { ArchiveRestore } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { RowActionButton } from './RowActionButton';

/**
 * Row "restore from archive" action (audit §4.7, PG-28): a `RowActionButton`
 * with the `ArchiveRestore` icon and the shared `common:actions.restore`
 * vocabulary, so every register restores archived rows the same way.
 *
 * `itemName` names the row in the accessible name ("Restore {{name}}"), so a
 * screen-reader user tabbing through several restore buttons hears which
 * record each one restores.
 */
export interface RowRestoreButtonProps {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    /** The row's display name, used in the accessible name and tooltip. */
    itemName?: string;
    /** When set, the action is inert and this text explains why. */
    disabledReason?: string;
    'data-testid'?: string;
}

export const RowRestoreButton = React.forwardRef<HTMLButtonElement, RowRestoreButtonProps>(
    ({ onClick, itemName, disabledReason, 'data-testid': testId }, ref) => {
        const { t } = useTranslation('common');
        const label = itemName ? t('actions.restore_named', { name: itemName }) : t('actions.restore');
        return (
            <RowActionButton
                ref={ref}
                icon={ArchiveRestore}
                label={label}
                onClick={onClick}
                disabledReason={disabledReason}
                data-testid={testId}
            />
        );
    },
);
RowRestoreButton.displayName = 'RowRestoreButton';
