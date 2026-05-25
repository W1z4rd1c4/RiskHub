import { Building2, RefreshCw, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useTranslation } from '@/i18n/hooks';

interface UsersPageHeaderProps {
    allowAuthModeActions: boolean;
    canRunDirectoryCheck: boolean;
    isAccessMode: boolean;
    isCheckingAllDirectory: boolean;
    isDirectoryFirstMode: boolean;
    onCheckAllDirectory: () => void;
}

export function UsersPageHeader({
    allowAuthModeActions,
    canRunDirectoryCheck,
    isAccessMode,
    isCheckingAllDirectory,
    isDirectoryFirstMode,
    onCheckAllDirectory,
}: UsersPageHeaderProps) {
    const { t } = useTranslation('admin');
    const navigate = useNavigate();

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                    <Users className="h-8 w-8 text-accent" />
                    {isAccessMode ? t('access.title') : t('users.title')}
                </h1>
                <p className="text-slate-400 mt-1">
                    {isAccessMode ? t('access.subtitle') : t('users.subtitle')}
                </p>
            </div>
            {allowAuthModeActions && (
                <div className="flex flex-wrap items-center gap-2">
                    {canRunDirectoryCheck && (
                        <button
                            onClick={onCheckAllDirectory}
                            disabled={isCheckingAllDirectory}
                            className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
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
                        onClick={() => navigate('/users/new')}
                        className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
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
