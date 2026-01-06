import { BookOpen, FileText, Shield, Users, BarChart3, Building, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface DocItem {
    id: string;
    title: string;
    description: string;
    icon: typeof BookOpen;
    url: string;
    roles: string[];
}

const documentation: DocItem[] = [
    {
        id: 'getting-started',
        title: 'Getting Started',
        description: 'Learn the basics of navigating and using RiskHub',
        icon: BookOpen,
        url: '/docs/getting-started.md',
        roles: ['cro', 'admin', 'department_head', 'risk_manager', 'employee'],
    },
    {
        id: 'risks',
        title: 'Managing Risks',
        description: 'Create, view, and manage organizational risks',
        icon: Shield,
        url: '/docs/risks-guide.md',
        roles: ['cro', 'admin', 'department_head', 'risk_manager'],
    },
    {
        id: 'controls',
        title: 'Managing Controls',
        description: 'Understand controls, execution logging, and risk linkage',
        icon: FileText,
        url: '/docs/controls-guide.md',
        roles: ['cro', 'admin', 'department_head', 'risk_manager'],
    },
    {
        id: 'kris',
        title: 'Key Risk Indicators',
        description: 'Submit KRI values and understand breach alerts',
        icon: BarChart3,
        url: '/docs/kris-guide.md',
        roles: ['cro', 'admin', 'department_head', 'risk_manager', 'employee'],
    },
    {
        id: 'department-head',
        title: 'Department Head Guide',
        description: 'Managing your team and departmental risk oversight',
        icon: Building,
        url: '/docs/department-head-guide.md',
        roles: ['cro', 'department_head'],
    },
    {
        id: 'admin',
        title: 'Administrator Guide',
        description: 'System configuration, user management, and monitoring',
        icon: Users,
        url: '/docs/admin-guide.md',
        roles: ['cro', 'admin'],
    },
];

export function DocumentationSettings() {
    const { user } = useAuth();
    const userRole = user?.role || 'employee';

    // Filter docs based on user role
    const visibleDocs = documentation.filter(doc => doc.roles.includes(userRole));

    const openDoc = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <section>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-accent" />
                    Documentation & Help
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                    Access guides and documentation tailored to your role ({user?.role_display_name || 'User'}).
                </p>
            </section>

            {/* Documentation Cards */}
            <section className="grid gap-4 md:grid-cols-2">
                {visibleDocs.map((doc) => {
                    const Icon = doc.icon;
                    return (
                        <button
                            key={doc.id}
                            onClick={() => openDoc(doc.url)}
                            className={cn(
                                "flex items-start gap-4 p-4 rounded-xl border transition-all text-left",
                                "border-white/10 bg-white/5 hover:border-accent/50 hover:bg-white/10",
                                "group"
                            )}
                        >
                            {/* Icon */}
                            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                                <Icon className="h-5 w-5 text-slate-400 group-hover:text-accent transition-colors" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold group-hover:text-accent transition-colors">
                                        {doc.title}
                                    </span>
                                    <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-accent transition-colors" />
                                </div>
                                <p className="text-sm text-slate-500 mt-1">
                                    {doc.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </section>

            {/* Quick Links */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="font-semibold mb-3">Quick Links</h4>
                <div className="flex flex-wrap gap-2">
                    <a
                        href="mailto:support@riskhub.local"
                        className="px-3 py-1.5 bg-white/10 text-slate-300 text-sm rounded-lg hover:bg-white/20 transition-colors"
                    >
                        Contact Support
                    </a>
                    <a
                        href="/activity-log"
                        className="px-3 py-1.5 bg-white/10 text-slate-300 text-sm rounded-lg hover:bg-white/20 transition-colors"
                    >
                        View Activity Log
                    </a>
                    <a
                        href="/notifications"
                        className="px-3 py-1.5 bg-white/10 text-slate-300 text-sm rounded-lg hover:bg-white/20 transition-colors"
                    >
                        Notifications
                    </a>
                </div>
            </section>

            {/* Version Info */}
            <section className="text-center">
                <p className="text-xs text-slate-500">
                    RiskHub v1.0 • Documentation will be expanded in future updates
                </p>
            </section>
        </div>
    );
}
