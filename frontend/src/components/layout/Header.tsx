import { Bell, Search, LogOut } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Header() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation('navigation');

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <header className="flex h-20 items-center justify-between px-8 bg-transparent">
            <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 w-96 group focus-within:border-accent/50 transition-colors">
                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent" />
                <input
                    type="text"
                    placeholder={t('header.search_placeholder')}
                    className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                />
            </div>

            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-white hover:bg-white/5 rounded-xl">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-background" />
                </Button>

                {user && (
                    <>
                        <div className="text-sm text-white/80 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-white/60 ml-2">({user.role_display_name})</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl"
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            {t('user_menu.logout')}
                        </Button>
                    </>
                )}
            </div>
        </header>
    );
}
