import { ChevronRight, Loader2 } from 'lucide-react';
import type { DemoAccount } from './loginPageTypes';

interface AccountButtonProps {
    account: DemoAccount;
    disabled: boolean;
    isLoading: boolean;
    onSelect: (email: string) => void;
    translate: (key: string) => string;
}

const colorClasses = {
    rose: 'hover:border-rose-400/50 hover:bg-rose-400/5',
    purple: 'hover:border-purple-400/50 hover:bg-purple-400/5',
    violet: 'hover:border-violet-400/50 hover:bg-violet-400/5',
    amber: 'hover:border-amber-400/50 hover:bg-amber-400/5',
    emerald: 'hover:border-emerald-400/50 hover:bg-emerald-400/5',
    sky: 'hover:border-sky-400/50 hover:bg-sky-400/5',
    teal: 'hover:border-teal-400/50 hover:bg-teal-400/5',
    indigo: 'hover:border-indigo-400/50 hover:bg-indigo-400/5',
    pink: 'hover:border-pink-400/50 hover:bg-pink-400/5',
} as const;

const badgeClasses = {
    rose: 'bg-rose-400/10 border-rose-400/20 text-rose-400',
    purple: 'bg-purple-400/10 border-purple-400/20 text-purple-400',
    violet: 'bg-violet-400/10 border-violet-400/20 text-violet-400',
    amber: 'bg-amber-400/10 border-amber-400/20 text-amber-400',
    emerald: 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400',
    sky: 'bg-sky-400/10 border-sky-400/20 text-sky-400',
    teal: 'bg-teal-400/10 border-teal-400/20 text-teal-400',
    indigo: 'bg-indigo-400/10 border-indigo-400/20 text-indigo-400',
    pink: 'bg-pink-400/10 border-pink-400/20 text-pink-400',
} as const;

export function AccountButton({
    account,
    disabled,
    isLoading,
    onSelect,
    translate,
}: AccountButtonProps) {
    return (
        <button
            onClick={() => onSelect(account.email)}
            disabled={disabled}
            className={`w-full p-3 flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl transition-all group disabled:opacity-50 ${colorClasses[account.color]}`}
        >
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${badgeClasses[account.color]}`}>
                    {account.name.split(' ').map((name) => name[0]).join('')}
                </div>
                <div className="text-left">
                    <p className="text-sm font-bold text-white">{account.name}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{translate(account.role_key)}</p>
                </div>
            </div>
            {isLoading ? (
                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
            ) : (
                <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors" />
            )}
        </button>
    );
}
