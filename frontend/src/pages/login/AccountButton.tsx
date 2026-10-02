import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/state';

import type { DemoAccount } from './loginPageTypes';

interface AccountButtonProps {
    account: DemoAccount;
    disabled: boolean;
    isLoading: boolean;
    onSelect: (email: string) => void;
    translate: (key: string) => string;
}

/**
 * One demo persona: an outline `Button` card named by the persona, role and department.
 * The initials avatar is decorative and uses one accent token style for every persona
 * (the persona colour carries no status meaning, so it is not mapped to a status tone).
 */
export function AccountButton({
    account,
    disabled,
    isLoading,
    onSelect,
    translate,
}: AccountButtonProps) {
    const initials = account.name.split(' ').map((name) => name[0]).join('');
    return (
        <Button
            variant="outline"
            size={null}
            onClick={() => onSelect(account.email)}
            disabled={disabled}
            aria-busy={isLoading || undefined}
            data-testid={`demo-persona-${account.email}`}
            className="group h-auto min-h-28 w-full justify-between whitespace-normal p-3 text-left hover:border-accent/50"
        >
            <span className="flex min-w-0 items-center gap-3">
                <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-xs font-bold text-accent-text"
                >
                    {initials}
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{account.name}</span>
                    <span className="block text-xs text-muted-foreground">{translate(account.role_key)}</span>
                    <span className="block text-xs text-muted-foreground">
                        {account.dept_key ? translate(account.dept_key) : '—'}
                    </span>
                </span>
            </span>
            {isLoading ? (
                <Spinner size="sm" />
            ) : (
                <ChevronRight className="text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
            )}
        </Button>
    );
}
