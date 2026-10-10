import type { ReactNode } from 'react';
import { AuthFrame } from '@/components/layout/AuthFrame';
import { useTranslation } from '@/i18n/hooks';
import type { NativeErrorKind } from '@/services/nativeAuthApi';

/** Native-account pages on the shared public frame: maps the native error kind and pending state. */
export function NativeFrame({ title, children, error, pending }: {
    title: string; children: ReactNode; error?: NativeErrorKind | 'expired' | null; pending?: boolean;
}) {
    const { t } = useTranslation('auth');
    return <AuthFrame
        title={title}
        error={error ? t(`native.errors.${error}`) : null}
        busy={pending}
        status={pending ? t('native.pending') : ''}
    >
        {children}
    </AuthFrame>;
}
