import { Building2, RefreshCw, UserPlus, Users } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface UsersPageHeaderProps {
    allowAuthModeActions: boolean;
    canRunDirectoryCheck: boolean;
    isAccessMode: boolean;
    isCheckingAllDirectory: boolean;
    isDirectoryFirstMode: boolean;
    onAddUser: () => void;
    onCheckAllDirectory: () => void;
}

export function UsersPageHeader({
    allowAuthModeActions,
    canRunDirectoryCheck,
    isAccessMode,
    isCheckingAllDirectory,
    isDirectoryFirstMode,
    onAddUser,
    onCheckAllDirectory,
}: UsersPageHeaderProps) {
    const { t } = useTranslation('admin');

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <Users className="h-8 w-8 text-accent" />
                    {isAccessMode ? t('access.title') : t('users.title')}
                </h1>
                <p className="text-muted-foreground mt-1">
                    {isAccessMode ? t('access.subtitle') : t('users.subtitle')}
                </p>
            </div>
            {allowAuthModeActions && (
                <div className="flex flex-wrap items-center gap-2">
                    {canRunDirectoryCheck && (
                        <button
                            type="button"
                            onClick={onCheckAllDirectory}
                            aria-disabled={isCheckingAllDirectory}
                            className="rounded-xl border border-info/30 bg-info/10 px-4 py-2 text-accent-text transition hover:bg-info/20 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                        >
                            <span className="inline-flex items-center gap-2">
                                <RefreshCw className={`h-4 w-4 ${isCheckingAllDirectory ? 'animate-spin' : ''}`} />
                                {isCheckingAllDirectory
                                    ? t('users.checking_directory')
                                    : t('users.check_directory')}
                            </span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onAddUser}
                        className="bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-[background-color,transform] active:scale-95"
                    >
                        {isDirectoryFirstMode ? <Building2 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                        {isDirectoryFirstMode
                            ? t('users.add_from_ad')
                            : t('access.add_user')}
                    </button>
                </div>
            )}
        </div>
    );
}
