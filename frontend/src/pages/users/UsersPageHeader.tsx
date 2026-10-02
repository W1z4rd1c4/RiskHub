import { Building2, UserPlus, Users } from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
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
                    <Button type="button" variant="accent" onClick={onAddUser}>
                        {isDirectoryFirstMode ? <Building2 aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
                        {isDirectoryFirstMode
                            ? t('users.add_from_ad')
                            : t('access.add_user')}
                    </Button>
                </>
            ) : undefined}
        />
    );
}
