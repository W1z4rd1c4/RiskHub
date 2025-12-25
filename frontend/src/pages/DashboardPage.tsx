import { motion } from 'framer-motion';
import {
    ClipboardList,
    Building2,
    AlertTriangle,
    CheckCircle,
    TrendingUp,
    Clock,
    ExternalLink
} from 'lucide-react';

const stats = [
    {
        title: 'Total Controls',
        value: '1,248',
        icon: ClipboardList,
        color: 'text-accent',
        bg: 'bg-accent/10',
        trend: '+12%',
    },
    {
        title: 'Active Depts',
        value: '14',
        icon: Building2,
        color: 'text-purple-400',
        bg: 'bg-purple-400/10',
        trend: 'Stable',
    },
    {
        title: 'Critical Risks',
        value: '23',
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-400/10',
        trend: '-5%',
    },
    {
        title: 'Compliance',
        value: '98.2%',
        icon: CheckCircle,
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/10',
        trend: '+0.5%',
    },
];

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export function DashboardPage() {
    return (
        <div className="space-y-10">
            <div>
                <h2 className="text-3xl font-black text-white mb-2">Operational Insight</h2>
                <p className="text-slate-500 font-medium">Overview of risk posture and control performance across the organization.</p>
            </div>

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
            >
                {stats.map((stat) => (
                    <motion.div key={stat.title} variants={item} className="glass-card group flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-6">
                            <div className={`${stat.bg} p-3 rounded-xl`}>
                                <stat.icon className={`h-6 w-6 ${stat.color}`} />
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                {stat.trend}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 mb-1">{stat.title}</p>
                            <h3 className="text-4xl font-black text-white tracking-tighter">{stat.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            <div className="grid gap-8 lg:grid-cols-3">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="lg:col-span-2 glass-card h-[400px] flex flex-col"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-accent" />
                            Risk Distribution
                        </h3>
                        <button className="text-xs font-bold text-accent hover:underline flex items-center gap-1">
                            Export View <ExternalLink className="h-3 w-3" />
                        </button>
                    </div>
                    <div className="flex-1 border-t border-white/5 flex flex-col items-center justify-center text-slate-600">
                        <div className="w-full h-32 flex items-end justify-center gap-4 px-20">
                            {[40, 70, 45, 90, 65, 80, 50, 85].map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ delay: 0.8 + (i * 0.1), duration: 0.8 }}
                                    className="w-full bg-accent/20 rounded-t-lg relative group"
                                >
                                    <div className="absolute inset-0 bg-accent opacity-0 group-hover:opacity-40 transition-opacity rounded-t-lg" />
                                </motion.div>
                            ))}
                        </div>
                        <p className="mt-8 text-sm font-medium">Aggregated control data over last 30 days</p>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass-card flex flex-col"
                >
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-400" />
                        Recent Activity
                    </h3>
                    <div className="space-y-6">
                        {[
                            { type: 'Control Approved', user: 'Jan Novák', time: '12m ago', color: 'bg-emerald-500' },
                            { type: 'Risk Identified', user: 'Petra Svobodová', time: '45m ago', color: 'bg-amber-500' },
                            { type: 'Dept Created', user: 'System Admin', time: '2h ago', color: 'bg-accent' },
                            { type: 'Report Exported', user: 'Martin Horák', time: '5h ago', color: 'bg-purple-500' },
                        ].map((activity, i) => (
                            <div key={i} className="flex gap-4 items-start">
                                <div className={`mt-1.5 w-2 h-2 rounded-full ${activity.color} shadow-sm`} />
                                <div>
                                    <p className="text-sm font-bold text-white leading-none mb-1">{activity.type}</p>
                                    <p className="text-xs text-slate-500 font-medium">{activity.user} • {activity.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="mt-auto w-full py-3 border border-white/5 rounded-xl text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                        View Audit Log
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
