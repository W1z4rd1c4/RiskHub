import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The "added filter" card a register filter bar renders inside
 * `RegisterListToolbar` for each optional filter the user added (audit §4.13,
 * GAP-D-22): one tokenised `bg-nested` surface (the former Vendor recipe) with
 * a named remove button in the corner, instead of a copied class string per
 * register.
 */
export interface RegisterFilterCardProps {
    /** Accessible name of the remove button, e.g. "Remove filter: Owner". */
    removeLabel: string;
    onRemove: () => void;
    children: ReactNode;
    'data-testid'?: string;
}

export function RegisterFilterCard({ removeLabel, onRemove, children, 'data-testid': testId }: RegisterFilterCardProps) {
    return (
        <div className="relative rounded-xl border border-border bg-nested p-3 pr-12" data-testid={testId}>
            <Button
                variant="secondary"
                size="iconCompact"
                aria-label={removeLabel}
                onClick={onRemove}
                className="absolute right-2 top-2"
            >
                <X aria-hidden="true" />
            </Button>
            {children}
        </div>
    );
}
