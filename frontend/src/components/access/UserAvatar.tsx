import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * The one initial-avatar recipe for user rows and the profile header (GAP-D-27).
 * Decorative: the user's name is always rendered next to it, so it is hidden
 * from assistive technology. Takes the first Unicode code point, so a name that
 * starts with an astral character is not split into half a surrogate pair.
 */
const avatarVariants = cva(
    'flex shrink-0 items-center justify-center rounded-full bg-accent/20 font-bold text-accent-text',
    {
        variants: {
            size: {
                md: 'h-10 w-10 text-base',
                lg: 'h-16 w-16 text-2xl',
            },
        },
        defaultVariants: { size: 'md' },
    },
);

function userInitial(name: string | null | undefined): string {
    const [first] = Array.from((name ?? '').trim());
    return first ? first.toLocaleUpperCase() : '?';
}

export interface UserAvatarProps extends VariantProps<typeof avatarVariants> {
    name: string | null | undefined;
    className?: string;
}

export function UserAvatar({ name, size, className }: UserAvatarProps) {
    return (
        <div aria-hidden="true" className={cn(avatarVariants({ size }), className)}>
            {userInitial(name)}
        </div>
    );
}
