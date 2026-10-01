import { Building2, UserPlus, Users } from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
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
        <PageHeader
            title={isAccessMode ? t('access.title') : t('users.title')}
            description={isAccessMode ? t('access.subtitle') : t('users.subtitle')}
            icon={Users}
            actions={allowAuthModeActions ? (
                <>
                    {canRunDirectoryCheck && (
                        <RefreshButton
                            variant="outline"
                            label={isCheckingAllDirectory
                                ? t('users.checking_directory')
                                : t('users.check_directory')}
                            onRefresh={onCheckAllDirectory}
                            isFetching={isCheckingAllDirectory}
                        />
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
                </>
            ) : undefined}
        />
    );
}
