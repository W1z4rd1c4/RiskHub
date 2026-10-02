import type { ReactNode } from 'react';
import { Unlink } from 'lucide-react';

import { RowActionButton } from '@/components/tables/RowActionButton';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

/**
 * Link rows of the entity link sections (Asset, Process, Threat; audit
 * 2026-09-30 AX-01, GAP-C-04): a list of linked records, each row with its
 * details on the left and its actions on the right.
 */
export function LinkedItemList({
    children,
    testId,
    className,
}: {
    children: ReactNode;
    testId?: string;
    className?: string;
}) {
    return (
        <ul className={cn('space-y-2', className)} data-testid={testId}>
            {children}
        </ul>
    );
}

export function LinkedItemRow({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-tint/5 px-4 py-3">
            <div className="min-w-0">{children}</div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </li>
    );
}

interface LinkRemoveButtonProps {
    /** Display name of the linked record: the accessible name says WHICH link is removed. */
    name: string;
    onClick: () => void;
    /** Keeps the button visible but inert and explains why. */
    disabledReason?: string;
    /** The removal is in flight: the button shows its spinner and is disabled. */
    isBusy?: boolean;
    testId?: string;
}

/**
 * Icon-only unlink action named "Remove link: {name}" (`common:links.remove_named`).
 * One element whether idle or busy, so a confirmation dialog can hand focus back to it.
 */
export function LinkRemoveButton({ name, onClick, disabledReason, isBusy = false, testId }: LinkRemoveButtonProps) {
    const { t } = useTranslation('common');
    return (
        <RowActionButton
            icon={Unlink}
            tone="danger"
            label={t('links.remove_named', { name })}
            disabledReason={disabledReason}
            isLoading={isBusy}
            onClick={onClick}
            data-testid={testId}
        />
    );
}
