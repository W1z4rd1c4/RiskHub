import { User, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function Header() {
    const { user, isLoading } = useAuth();

    return (
        <header className="flex h-20 items-center justify-between px-8 bg-transparent">
            <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 w-96 group focus-within:border-accent/50 transition-colors">
                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent" />
                <input
                    type="text"
                    placeholder="Search controls, departments..."
                    className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                />
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-white hover:bg-white/5 rounded-xl">
                        <Bell className="h-5 w-5" />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-background" />
                    </Button>
                </div>

                <div className="h-8 w-[1px] bg-white/10" />

                {isLoading ? (
                    <div className="h-10 w-40 animate-pulse rounded-xl bg-white/5" />
                ) : user ? (
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-white leading-none mb-1">{user.name}</p>
                            <p className="text-[10px] font-black text-accent uppercase tracking-tighter">{user.role_display_name}</p>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center group cursor-pointer hover:bg-accent/30 transition-colors">
                            <User className="h-6 w-6 text-accent" />
                        </div>
                    </div>
                ) : null}
            </div>
        </header>
    );
}
