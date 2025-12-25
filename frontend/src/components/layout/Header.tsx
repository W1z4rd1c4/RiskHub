import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function Header() {
    const { user, isLoading, error } = useAuth();

    return (
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
            <div>
                <h1 className="text-lg font-semibold text-slate-900">
                    Risk Management Platform
                </h1>
                {error && (
                    <p className="text-xs text-amber-600">{error}</p>
                )}
            </div>

            <div className="flex items-center gap-4">
                {isLoading ? (
                    <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
                ) : user ? (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-medium text-slate-900">{user.name}</p>
                            <p className="text-xs text-slate-500">{user.role_display_name}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <User className="h-5 w-5" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-medium text-slate-900">Not logged in</p>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
}
