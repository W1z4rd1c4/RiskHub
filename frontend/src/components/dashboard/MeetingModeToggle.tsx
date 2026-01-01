import { Presentation, Monitor } from 'lucide-react';

interface Props {
    isActive: boolean;
    onToggle: () => void;
}

export function MeetingModeToggle({ isActive, onToggle }: Props) {
    return (
        <button
            onClick={onToggle}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${isActive
                    ? 'bg-accent text-white shadow-[0_0_20px_rgba(30,132,255,0.3)]'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
        >
            {isActive ? <Presentation className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            {isActive ? 'Exit Meeting Mode' : 'Meeting Mode'}
        </button>
    );
}
